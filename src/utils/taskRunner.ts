/**
 * 一个简单的内存锁，用于防止长时间运行的任务重复执行。
 * 在生产环境中，您可能会使用 Redis 或其他更健壮的锁机制。
 */
let isTaskRunning = false;

export const taskRunner = {
  isLocked: (): boolean => {
    return isTaskRunning;
  },

  lock: (): boolean => {
    if (isTaskRunning) {
      return false; // 无法获取锁
    }
    isTaskRunning = true;
    return true; // 成功获取锁
  },

  unlock: (): void => {
    isTaskRunning = false;
  },
};
