import { EventEmitter } from 'events';

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function sendTaskUpdate(userId, task) {
  emitter.emit(`task:${userId}`, task);
}

export function taskSSEMiddleware(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('data: {"type":"connected"}\n\n');

  const handler = (task) => {
    res.write(`data: ${JSON.stringify(task)}\n\n`);
  };

  emitter.on(`task:${req.userId}`, handler);

  const interval = setInterval(() => res.write(':ping\n\n'), 15000);

  req.on('close', () => {
    emitter.off(`task:${req.userId}`, handler);
    clearInterval(interval);
  });
}
