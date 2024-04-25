import "@logseq/libs";
import { IBatchBlock, PageEntity, IHookEvent } from "@logseq/libs/dist/LSPlugin";

import { format } from "date-fns";

import settingSchema from "./settings";

function main() {
  console.info("Logseq Google Tasks Plugin Loading!");

  settingSchema();

  logseq.App.registerCommandPalette(
    { key: "sync-google-tasks", label: "Sync Google Tasks" },
    syncGoogleTasks
  );
}

logseq.ready(main).catch(console.error);

declare var gapi: any;

async function syncGoogleTasks() {
  console.log(gapi);

  await new Promise(resolve => {
    gapi.load('client', resolve);
  });

  console.log(gapi.client);

  if (!logseq.settings?.access_token) {
    throw new Error("Access token is not set.");
  }

  let tokenJson = '{"access_token":"' + logseq.settings.access_token + '"}';
  let token = JSON.parse(tokenJson);
  gapi.client.setToken(token);

  await new Promise(resolve => {
    gapi.client.init({
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest'],
    }).then(resolve);
  });

  let taskLists = await fetchTaskLists() ?? [];

  let tasksArray = (await Promise.all(taskLists.map(
    async (taskList: any) => {
      let tasks = await fetchTasks(taskList.id);

      return tasks?.map((task: any) => {
        return [taskList, task];
      });
    }
  ))).flat();

  let tasksNew: { [key: string]: any[] } = {}

  for (let taskArray of tasksArray) {
    let [list, task] = taskArray as [any, any];

    let res = await logseq.DB.q(`(property :google-task-id "${task.id}")`);

    if (res && res.length > 1) {
      console.warn(`Multiple tasks with the same id found: ${task.id}`);
    }

    if (res && res.length > 0) {
      if (res[0].properties["googleTaskUpdated"] === task.updated) {
        continue;
      }

      console.log(`Update block: ${res[0].uuid} with task: ${task.id}`);

      let block = await blockContentGenerate(list, task);

      logseq.Editor.updateBlock(res[0].uuid, block.content, { properties: block.properties });
    }
    else {
      console.log(`Insert block for task: ${task.id}`);

      let parentName = await generateParentName(list, task);

      tasksNew[parentName] = tasksNew[parentName] || [];
      tasksNew[parentName].push([list, task])
    }
  }

  for (let [parentName, tasks] of Object.entries(tasksNew)) {
    let pageEntity = await ensurePage(parentName, false);
    if (!pageEntity) {
      throw new Error(`Unable to create parent page ${parentName}`);
    }

    logseq.Editor.insertBatchBlock(pageEntity.uuid, await Promise.all(tasks.map(async ([list, task]) => {
      return await blockContentGenerate(list, task);
    })));
  }
}

/**
 * Fetches all task lists from the Google Tasks API.
 * @returns {Promise<any[]>} A promise that resolves to an array of task lists.
 */
async function fetchTaskLists() {
  let taskLists: any[] = [];
  let nextPageToken;
  do {
    let response: any = await gapi.client.tasks.tasklists.list({
      'maxResults': 100,
      'pageToken': nextPageToken
    });

    taskLists = taskLists.concat(response.result.items);
    nextPageToken = response.result.nextPageToken;
  } while (nextPageToken);

  if (!taskLists || taskLists.length == 0) {
    console.info('No task lists found.');
    return;
  }

  // Flatten to string to display
  const output = taskLists.reduce(
    (str: any, taskList: any) => `${str}${taskList.title} (${taskList.id})\n`,
    'Task lists:\n');
  console.debug(output);

  return taskLists;
}

/**
 * Fetches tasks from the Google Tasks API for a given task list ID.
 * @param taskListId - The ID of the task list.
 * @returns {Promise<any[]>} A promise that resolves to an array of tasks.
 */
async function fetchTasks(taskListId: string) {
  let tasks: any[] = [];
  let nextPageToken;
  do {
    // Workaround for bug https://issuetracker.google.com/issues/168580260,
    // that update individual task does not update the etag of the task list
    // so the list request will return cached/stalled data.
    //let response: any = await gapi.client.tasks.tasks.list({
    let url = `https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks?cacheBuster=${Date.now()}`;
    let response: any = await gapi.client.request({
      path: url,
      method: 'GET',
      params: {
        'tasklist': taskListId,
        'pageToken': nextPageToken,
        'maxResults': 100,
        'showHidden': true,
        'showDeleted': true,
        'showCompleted': true,
      }
    });
    tasks = tasks.concat(response.result.items);
    nextPageToken = response.result.nextPageToken;
  } while (nextPageToken);

  if (!tasks || tasks.length == 0) {
    console.info('No tasks found.');
    return;
  }

  // Flatten to string to display
  const output = tasks.reduce(
    (str: any, task: any) => `${str}${task.title} (${task.id})\n`,
    'Tasks:\n');
  console.debug(output);

  return tasks;
}

/**
 * Ensures the existence of a page in Logseq.
 * If the page doesn't exist, it creates a new page with the specified name.
 * If the page already exists, it returns the existing page entity.
 * 
 * @param page - The name of the page to ensure.
 * @param isJournal - Optional. Specifies whether the page is a journal page. Default is false.
 * @returns A Promise that resolves to the PageEntity of the page, or null if the page couldn't be created.
 */
async function ensurePage(page: string, isJournal: boolean = false): Promise<PageEntity | null> {
  const pageEntity = await logseq.Editor.getPage(page);
  if (!pageEntity) {
    return await logseq.Editor.createPage(page, {}, { journal: isJournal });
  }
  return pageEntity;
}

/**
 * Generates a batch block based on the provided task.
 * @param task - The task object.
 *   {
 *     "kind": string,
 *     "id": string,
 *     "etag": string,
 *     "title": string,
 *     "updated": string,
 *     "selfLink": string,
 *     "parent": string,
 *     "position": string,
 *     "notes": string,
 *     "status": string,
 *     "due": string,
 *     "completed": string,
 *     "deleted": boolean,
 *     "hidden": boolean,
 *     "links": [
 *       {
 *         "type": string,
 *         "description": string,
 *         "link": string
 *       }
 *     ],
 *     "webViewLink": string
 *   }
 * @returns A promise that resolves to the generated batch block.
 *
 * @TODO handle parent relationship
 * @TODO handle repeat of the deadline
 */
async function blockContentGenerate(list: any, task: any): Promise<IBatchBlock> {
  const { preferredDateFormat, preferredTodo } = await logseq.App.getUserConfigs();

  let title = task.title;
  switch (task.status) {
    default:
    case 'needsAction':
      title = `${preferredTodo} ${title}`;
      break;
    case 'completed':
      title = `DONE ${title}`;
      break;
  }

  // Create a block for the task title
  const taskBlock: IBatchBlock = {
    content: `${title}`,
  };

  taskBlock.properties = {};
  taskBlock.properties["google-task-id"] = task.id;
  taskBlock.properties["google-task-list"] = `[[GTasks/${list.title}]]`;
  taskBlock.properties["google-task-updated"] = task.updated;
  taskBlock.properties["google-task-webViewLink"] = task.webViewLink;
  if (task.hidden && task.status !== 'completed') {
    taskBlock.properties["google-task-hidden"] = task.hidden;
  }
  if (task.deleted) {
    taskBlock.properties["google-task-deleted"] = task.deleted;
  }

  let taskDueDate: string | undefined;
  if (task.due) {
    taskDueDate = format(
      new Date(task.due),
      preferredDateFormat,
    );
    taskBlock.content += `\nDEADLINE: <${taskDueDate}>`;
  }

  let taskCompletedDate: string | undefined;
  if (task.completed) {
    taskCompletedDate = format(
      new Date(task.completed),
      preferredDateFormat,
    );
    taskBlock.properties["completed"] = `[[${taskCompletedDate}]]`;
  }

  // Create a child block for the task notes
  if (task.notes) {
    const notesBlock: IBatchBlock = {
      content: task.notes || '',
      children: [],
    };
    taskBlock.children = [];
    taskBlock.children.push(notesBlock);
  }

  // Create a child block for the task links
  // For now just dump the links as a code block
  // Next step is to parse the links and create proper blocks to reference
  if (task.links && task.links.length > 0) {
    const linksBlock: IBatchBlock = {
      content: `\`\`\`\n${JSON.stringify(task.links, null, 2)}\n\`\`\``,
      children: [],
    };
    taskBlock.children = [];
    taskBlock.children.push(linksBlock);
  }

  return taskBlock;
}

/**
 * Generates the parent name for a task based on the preferred date format.
 * @param list - The list containing the task.
 * @param task - The task for which to generate the parent name.
 * @returns A string representing the parent name.
 * @throws An error if neither the updated date nor the due date is available for the task.
 */
async function generateParentName(list: any, task: any): Promise<string> {
  const { preferredDateFormat } = await logseq.App.getUserConfigs();
  const taskUpdatedDate = task.updated ? new Date(task.updated) : null;
  const taskDueDate = task.due ? new Date(task.due) : null;

  let earliestDate;

  if (taskUpdatedDate && taskDueDate) {
    earliestDate = taskUpdatedDate < taskDueDate ? taskUpdatedDate : taskDueDate;
  } else {
    earliestDate = taskUpdatedDate || taskDueDate;
  }

  if (!earliestDate) {
    throw new Error("Neither updated date nor due date is available for the task.");
  }

  return `${format(earliestDate, preferredDateFormat)}`;
}
