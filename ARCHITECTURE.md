# AI Task Platform Architecture Document

## Overview
The AI Task Platform is built on a modern microservices architecture designed for high availability, horizontal scalability, and GitOps-driven deployment. The system consists of a React/Next.js frontend, a Node.js API, and a Python worker service, all orchestrated within a Kubernetes cluster.

---

## 1. Worker Scaling Strategy

The system employs a multi-layered scaling strategy to ensure efficient task processing:

### **A. Event-Driven Scaling (KEDA)**
We use **KEDA (Kubernetes Event-driven Autoscaling)** to monitor the Redis `task:queue` list length.
- **Trigger**: The scaler activates when the number of pending tasks in the queue exceeds a threshold (e.g., 5 tasks).
- **Replica Range**: Scaled from **1 to 20 replicas**.
- **Benefit**: This allows the worker pool to expand rapidly during bursts of task submissions and scale down to a minimum footprint when the queue is empty, optimizing resource consumption.

### **B. Resource-Based Scaling (HPA)**
A native **Horizontal Pod Autoscaler (HPA)** acts as a secondary mechanism.
- **Metric**: CPU utilization (Target: 70%).
- **Benefit**: If individual tasks are computationally intensive (e.g., complex AI operations), the system scales based on actual resource pressure even if the queue length is low.

---

## 2. High Task Volume Handling (100k+ tasks/day)

To handle a high volume of 100k+ tasks per day, the architecture follows several distributed system principles:

- **Asynchronous Decoupling**: The API does not process tasks directly. It writes the task to MongoDB and pushes the Task ID to a Redis queue. This "fire-and-forget" pattern ensures the API remains responsive regardless of task complexity.
- **Stateless Workers**: Workers are completely stateless. They pull a Task ID from Redis, fetch the data from MongoDB, process it, and update the status. Any worker can pick up any task.
- **Concurrency**: By scaling to 20+ workers, each handling tasks in parallel, the system can process thousands of tasks per hour.
- **Load Balancing**: The Kubernetes Ingress and Service layers distribute traffic across multiple API and Frontend replicas to prevent bottlenecks.

---

## 3. Database Indexing Strategy

We use **MongoDB** for task persistence and user management. To maintain performance under heavy load, the following indexing strategy is implemented:

- **Single Field Indexes**:
    - `userId`: Essential for fast retrieval of a specific user's task history.
    - `status`: Used to efficiently query tasks in specific states (e.g., 'pending', 'running').
- **Compound Indexes**:
    - `{ status: 1, createdAt: -1 }`: Optimizes the "active tasks" view, allowing the system to quickly find the most recent tasks of a certain status.
    - `{ userId: 1, createdAt: -1 }`: Ensures that the user's dashboard (showing their latest tasks) loads instantly even as the total task count grows into the millions.
- **TTL Indexes (Optional Recommendation)**: For high volumes, a TTL index on the `logs` or `results` of older tasks can be used to automatically archive or delete data after 30 days.

---

## 4. Handling Redis Failure

Redis acts as the critical message broker. The system is designed to handle Redis outages gracefully:

- **Worker Resilience**:
    - Workers use a `ping()` check and connection retries (every 5 seconds).
    - When Redis is down, the worker marks itself as `unhealthy` via its `/health` endpoint. Kubernetes Readiness probes will then stop sending traffic/restarting if necessary.
- **API Resilience**:
    - The API uses `ioredis` with a retry strategy (exponential backoff).
    - If Redis is unreachable during a task submission, the API returns a `503 Service Unavailable` error to the user, ensuring they are aware the task wasn't queued.
- **Data Integrity**: Since the task is first saved to MongoDB with a `pending` status, "lost" tasks can be recovered by a cleanup script that re-queues any tasks stuck in `pending` for too long.

---

## 5. Deployment Strategy (Staging & Production)

We utilize a **GitOps workflow** managed by **Argo CD** for all deployments.

- **Infrastructure Repository**: All Kubernetes manifests (YAML) are stored in a dedicated `infra` repository.
- **Environment Separation**:
    - **Namespaces**: We use K8s namespaces (e.g., `ai-task-platform-staging` and `ai-task-platform-prod`) to isolate environments.
    - **Kustomize**: We use Kustomize overlays to manage environment-specific configurations (e.g., smaller resource limits in staging, different MongoDB connection strings).
- **Automated CI/CD**:
    - GitHub Actions builds the Docker images on every push.
    - After a successful build, the pipeline automatically updates the image tags in the `infra` repository.
    - Argo CD detects the change in the `infra` repo and performs an **Auto-Sync** to the cluster, ensuring the live state matches the desired state in Git.
