importScripts('https://unpkg.com/idb-keyval@6.2.0/dist/umd.js');

async function saveTasks(tasks) {
    const today = new Date().toDateString();
    try {
        await self.idbKeyval.set(`tasks_${today}`, tasks);
    } catch (error) {
        console.error('Error saving tasks to IndexedDB:', error);
        throw error;
    }
}

async function getTasks(date) {
    try {
        const tasks = await self.idbKeyval.get(`tasks_${date}`) || [];
        return tasks;
    } catch (error) {
        console.error('Error retrieving tasks from IndexedDB:', error);
        return [];
    }
}