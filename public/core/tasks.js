window.CoreTasks = {
  parseTasks: (taskText) => {
    if (!taskText) return [];
    if (taskText.startsWith('[')) {
      try { return JSON.parse(taskText); } catch(e) { return []; }
    } else {
      return [{ id: Date.now(), text: taskText, done: false }];
    }
  },
  // Erledigte Aufgaben bleiben erhalten — abgehakt, nicht geloescht.
  serializeTasks: (tasksArray) => {
    const finalTasks = (tasksArray || []);
    return finalTasks.length > 0 ? JSON.stringify(finalTasks) : '';
  }
};
