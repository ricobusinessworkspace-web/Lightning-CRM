window.CoreTasks = {
  parseTasks: (taskText) => {
    if (!taskText) return [];
    if (taskText.startsWith('[')) {
      try { return JSON.parse(taskText); } catch(e) { return []; }
    } else {
      return [{ id: Date.now(), text: taskText, done: false }];
    }
  },
  serializeTasks: (tasksArray) => {
    let finalTasks = (tasksArray || []).filter(t => !t.done);
    return finalTasks.length > 0 ? JSON.stringify(finalTasks) : '';
  }
};
