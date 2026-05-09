# AI Task Processing Platform — Architecture Document

## 1. System Overview

The AI Task Processing Platform is a distributed system that allows users to submit text-processing tasks (uppercase, lowercase, reverse string, word count) and processes them asynchronously. It follows a microservices-inspired architecture with three main services: a React frontend, a Node.js/Express backend API, and a Python-based worker service. Redis serves as the job queue, and MongoDB as the primary data store.

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌─────────┐
│  Browser │────▶│ Frontend │────▶│ Backend  │────▶│ MongoDB │
│ (React)  │◀────│ (Nginx)  │◀────│ (Express)│◀────│  (DB)   │
└──────────┘     └────┬─────┘     └────┬─────┘     └─────────┘
         ◀─────────────┘               │
          SSE Stream                    ▼
                                  ┌──────────┐     ┌─────────┐
                                  │  Redis   │────▶│ Worker  │
                                  │  Queue   │     │ (Python)│
                                  └──────────┘     └────┬─────┘
                                                         │
                                                    ┌────▼────┐
                                                    │ Health  │
                                                    │ Server  │
                                                    │ :8080   │
                                                    └─────────┘
```

## 2. Component Details

### 2.1 Frontend (React + Vite + TailwindCSS + Framer Motion)
- Served via Nginx (static files + API proxy)
- **Styling**: TailwindCSS utility classes with dark mode support and Framer Motion animations for micro-interactions
- **Real-time updates**: Server-Sent Events (SSE) stream from `/api/tasks/stream` — eliminates polling
- **Pages**: Login, Register, Dashboard (task list with status filter, pagination, real-time SSE updates), Create Task, Task Detail
- Dashboard auto-subscribes to SSE on mount; TaskDetail also subscribes for live status changes

### 2.2 Backend API (Node.js + Express)
- RESTful endpoints under `/api/auth` and `/api/tasks`
- **Swagger docs**: Available at `/api-docs` with interactive API explorer
- **Validation**: Zod schemas for all request bodies with middleware-based validation
- **Global error handler**: Centralized Express error middleware with proper status codes
- **SSE (Server-Sent Events)**: In-memory EventEmitter dispatches task updates to connected clients per userId
- **Auth**: Register with bcrypt (cost 12) hashed passwords, login returns JWT (7-day expiry)
- **Tasks**: CRUD with ownership scoping — users only see their own tasks
- **Queue**: Pushes task IDs to Redis list (`task:queue`) on creation
- **Security**: Helmet (HTTP headers), express-rate-limit (100 req/15min on auth), JWT middleware, no secrets in code
- **Logging**: Structured JSON logging with Pino (pretty-printed in dev)

### 2.3 Worker (Python)
- **Health server**: Embedded HTTP server on port 8080 for K8s liveness/readiness probes
- **Structured logging**: JSON-formatted log output with task_id context
- **Queue**: Blocks on `BRPOP task:queue` via Redis — competing consumers pattern
- **Processing**: Fetches task from MongoDB, updates status to `running`, processes text with the requested operation
- **Success**: Saves result and status `success` with timestamped logs
- **Failure**: Saves error message and status `failed`, moves task to Dead Letter Queue (Redis list `task:dlq`) with stack trace
- **Stateless**: Any worker can pick up any task — enables horizontal scaling

### 2.4 Databases
- **MongoDB**: Stores users and tasks. Supports rich queries and indexing. StatefulSet in K8s with persistent volumes.
- **Redis**: Lightweight in-memory queue for job distribution and DLQ storage. Stateless, can be recreated.

## 3. Worker Scaling Strategy

### Competing Consumers Pattern (Primary)
All worker replicas subscribe to the same Redis list (`task:queue`). Redis `BRPOP` is atomic — each task ID is delivered to exactly one consumer:
- **Scale out**: Increase `replicas` — additional workers automatically pull from the same queue
- **No coordination needed**: Workers don't communicate with each other
- **Graceful degradation**: If a worker crashes mid-job, task stays in "running" state; a reconciliation job can reset stale running tasks

### Kubernetes HPA (Secondary)
CPU-based autoscaling (target 70%) as a safety net — scales 2–10 replicas.

### KEDA Event-Driven Autoscaling (Recommended for Production)
The `keda-scaledobject.yaml` manifest scales workers based on **Redis queue length** (`LLEN task:queue`):
- When queue exceeds 5 items, KEDA adds more worker pods
- When queue drains below 1, KEDA scales back to minimum
- More responsive than CPU-based HPA for queue-based workloads

## 4. Handling High Task Volume (100k tasks/day)

### Capacity Calculation
- 100,000 tasks / 86,400 seconds ≈ **1.16 tasks/second** (average)
- With burst capacity, we design for **10 tasks/second** peak

### Buffering with Redis
Redis handles millions of operations per second. A `BRPOP` on a list is O(1). At 10 tasks/sec, Redis overhead is negligible. The queue can buffer thousands of tasks without issue.

### Worker Pool Sizing
- Each task takes <100ms to process (string operations)
- 1 worker processes ~10 tasks/second
- At 10 tasks/sec peak, **2–3 workers** are sufficient
- KEDA range of 1–20 provides 20× headroom for bursts

### MongoDB Indexing Strategy

| Index | Fields | Purpose |
|-------|--------|---------|
| `tasks_status_created` | `{ status: 1, createdAt: -1 }` | Dashboard filtering by status |
| `tasks_user_created` | `{ userId: 1, createdAt: -1 }` | User-scoped task listing |
| `users_email` | `{ email: 1 }` (unique) | Fast login lookups |

These indexes support the two primary query patterns:
1. "Show me all my tasks, newest first" → covered by `tasks_user_created`
2. "Show me my failed tasks" → covered by `tasks_status_created`

### Database Sizing
- 100k tasks/day × 30 days = 3M tasks/month
- Average task document: ~2KB → 6GB/month storage
- MongoDB handles this comfortably on a single node. For higher volumes, shard on `userId`.

## 5. Handling Redis Failure

Redis is critical for real-time queue processing but not for data durability. The system degrades gracefully:

### Detection
- Backend's `pushTask()` catches Redis connection errors
- Worker's main loop catches `redis.exceptions.ConnectionError` and sets health status to unhealthy

### Backend Fallback
When Redis is unavailable, the backend:
1. Logs a warning: "Redis unavailable, task queued in DB"
2. Task remains in `pending` status in MongoDB
3. When Redis recovers, a reconciliation job can re-queue pending tasks

### Worker Fallback
When Redis is down, the worker:
1. Sets global `HEALTHY = False` → health probe returns 503
2. K8s detects unhealthy pod and restarts it
3. Logs "Redis unavailable, retrying in 5s..." with exponential backoff

### Dead Letter Queue
Tasks that fail during processing are moved to Redis list `task:dlq`:
- Contains JSON entries with `task_id`, `error`, and `timestamp`
- Can be inspected and re-queued manually or via a recovery job
- Prevents task loss from transient processing failures

### Recovery
When Redis comes back online:
- New tasks are pushed to Redis normally
- Workers resume pulling from the queue
- Health status returns to healthy

### Production Recommendation
Deploy Redis with Sentinel or Cluster mode for high availability. Use Redis persistence (AOF + RDB) so queued tasks survive restarts.

## 6. Staging and Production Environments

### Namespace Isolation
- **Staging**: `ai-task-platform-staging` namespace
- **Production**: `ai-task-platform-production` namespace  
- All manifests are identical except for ConfigMap values and image tags

### Deployment Strategy

| Aspect | Staging | Production |
|--------|---------|------------|
| Image Tag | `:staging` or `:sha` | `:v1.0.0` or `:sha` |
| Replicas | 1 per service | 2+ per service |
| Resource Limits | Lower (half of prod) | Full limits |
| Database | Ephemeral (no PVC) | Persistent with backups |
| Ingress | Internal-only | Public with TLS |
| Monitoring | Basic health checks | Full Prometheus + Grafana |
| Autoscaling | HPA (CPU) | KEDA (queue length) |

### GitOps Workflow (Argo CD)
1. Developer pushes code to `main` or `staging` branch of application repo
2. CI/CD pipeline runs lint → tests → builds images → pushes to Docker Hub
3. CI/CD automatically updates image tags in the infra repo
4. Argo CD detects drift (new image tags) via auto-sync and applies to cluster
5. K8s performs rolling update of deployments

### CI/CD Pipeline Stages
```
Push → Lint → Test (Jest + Supertest + pytest) → Build & Push → Update Infra → Argo CD Sync
```

### Argo CD Setup
```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl apply -f infra/k3s/argo-application.yaml
```

### Promotion Flow
```
Feature Branch → PR → CI passes → Merge to staging
                                        ↓
                              Build & push :staging images
                                        ↓
                              CI updates infra repo (staging)
                                        ↓
                              Argo CD syncs staging
                                        ↓
                              Manual approval → merge to main
                                        ↓
                              Build & push :sha images
                                        ↓
                              CI updates infra repo (production)
                                        ↓
                              Argo CD syncs production
```

## 7. Security Considerations

- **Passwords**: bcrypt with cost factor 12
- **JWT**: Signed with HS256, 7-day expiry, transmitted via `Authorization: Bearer` header
- **Helmet**: Sets security-relevant HTTP headers (CSP, HSTS, X-Frame-Options, etc.)
- **Rate Limiting**: 100 requests per 15 minutes on auth endpoints
- **No Secrets in Code**: All secrets via environment variables (K8s Secrets in production, .env in development)
- **Non-root Containers**: All Docker images run as non-root users
- **Input Validation**: Zod schema validation on all endpoints; operation restricted to allowed enum
- **Dependency Scanning**: Lock files committed for reproducible builds

## 8. Real-Time Updates (SSE)

The platform uses Server-Sent Events for real-time task status updates:

### Flow
1. Frontend opens an SSE connection to `GET /api/tasks/stream`
2. Backend keeps the connection open, sending periodic keepalive pings
3. When a task is created or updated, backend emits an event to the user's stream
4. Frontend immediately updates the task status without polling

### Why SSE over WebSockets
- Simpler protocol (plain HTTP, no upgrade handshake)
- Built-in reconnection in EventSource API
- Unidirectional (server → client) is all we need
- Works through all standard HTTP proxies

## 9. API Documentation

Interactive Swagger UI available at `/api-docs` when the backend is running. Provides:
- Complete endpoint reference with request/response schemas
- "Try it out" functionality for testing endpoints
- JWT token authentication via "Authorize" button
- OpenAPI 3.0 specification at `/api/docs.json`

## 10. Testing Strategy

### Backend (Jest + Supertest)
- Authentication flow (register, login, duplicate email, invalid credentials)
- Task CRUD (create, list, invalid operations, unauthorized access)
- Uses isolated test database

### Worker (pytest)
- Unit tests for all string operations (uppercase, lowercase, reverse, word_count)
- Edge cases: empty strings, Unicode, special characters
- Tested independently of Redis/MongoDB

## 11. Future Improvements

- WebSocket upgrade for bidirectional communication
- Prometheus metrics on queue depth, task latency, error rates
- Centralized logging with ELK/Loki stack
- Task priority levels and batch processing
- File upload support
- Automated reconciliation of stale "running" tasks
- gRPC between backend and worker for lower latency
