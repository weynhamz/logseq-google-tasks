import "@logseq/libs";
import { IBatchBlock, PageEntity, IHookEvent, BlockEntity } from "@logseq/libs/dist/LSPlugin";

import { format, parse } from "date-fns";

import settingSchema from "./settings";

const pluginId = 'logseq-google-tasks';

interface HttpError extends Error {
  status?: number;
}

function main() {
  console.info(`#${pluginId}: ` + "Logseq Google Tasks Plugin Loading!");

  settingSchema();

  logseq.App.registerCommandPalette(
    { key: "sync-google-tasks", label: "Sync Google Tasks" },
    async () => {
      try {
        await syncGoogleTasks();
      } catch (error: any) {
        let httpError = error as HttpError;
        if (httpError.status === 401) {
          console.error(`#${pluginId}: ` + 'Access token expired, please re-authenticate');
          logseq.UI.showMsg("Google Tasks Access token expired, please re-authenticate", 'error');
          logseq.showSettingsUI();
        }
      }
    }
  );
}

logseq.ready(main).catch(console.error);

declare var gapi: any;

async function syncGoogleTasks() {
  console.info(`#${pluginId}: ` + "Start Syncing Google Tasks");

  console.debug(gapi);

  await new Promise(resolve => {
    gapi.load('client', resolve);
  });

  console.debug(gapi.client);

  if (!logseq.settings?.access_token) {
    throw new Error("Access token is not set.");
  }

  let token = JSON.parse('{"access_token":"' + logseq.settings.access_token + '"}');
  gapi.client.setToken(token);

  await new Promise(resolve => {
    gapi.client.init({
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest'],
    }).then(resolve);
  });

  let taskLists = await fetchTaskLists() ?? [];

  let tasksArray = (await Promise.all(taskLists.map(
    async (taskList: any) => {
      let tasks = await fetchTasks(taskList.id) ?? [];

      return tasks.map((task: any) => {
        return [taskList, task];
      });
    }
  ))).flat();

  let tasksNew: { [key: string]: any[] } = {}

  for (let taskArray of tasksArray) {
    let [list, task] = taskArray as [any, any];

    let res = await logseq.DB.q(`(property :google-task-id "${task.id}")`);

    if (res && res.length > 1) {
      console.warn(`#${pluginId}: ` + `Multiple tasks with the same id found: ${task.id}`);
    }

    if (res && res.length > 0) {
      if (res[0].properties["googleTaskUpdated"] === task.updated) {
        // Here we only try to update GTasks if updated time is the same
        // If GTasks is newer, and there is also local changes, local changes
        // will be discarded as Logseq currently doesn't recored change date
        // on block level reliably.
        pushLocalChanges(res[0], task);
        continue;
      }

      updateTaskBlock(res[0], list, task);
    }
    else {
      // When a task is deleted in Google Tasks, the task is marked as deleted
      // and hidden from UI, then it is deleted asynchronously later.
      if (task.deleted) {
        continue;
      }

      console.info(`#${pluginId}: ` + `Insert block for task: ${task.id}`);

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
async function fetchTaskLists(): Promise<gapi.client.tasks.TaskList[] | undefined> {
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
    console.info(`#${pluginId}: ` + 'No task lists found.');
    return;
  }

  return taskLists;
}

/**
 * Fetches tasks from the Google Tasks API for a given task list ID.
 * @param taskListId - The ID of the task list.
 * @returns A promise that resolves to an array of tasks.
 */
async function fetchTasks(taskListId: string): Promise<gapi.client.tasks.Task[] | undefined> {
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
    console.info(`#${pluginId}: ` + 'No tasks found.');
    return;
  }

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
 * Updates a task block with the provided task information.
 * @param block - The block entity representing the task block.
 * @param list - The task list object or its ID.
 * @param task - The task object.
 */
async function updateTaskBlock(block: BlockEntity, list: gapi.client.tasks.TaskList | string, task: gapi.client.tasks.Task) {
  console.info(`#${pluginId}: ` + `Update block: ${block.uuid} with task: ${task.id} : ${task.title}`);
  console.debug('Remote' + task.updated);
  console.debug(task);
  console.debug('Local ' + block.properties?.["googleTaskUpdated"]);
  console.debug(block);

  // Get list object if list is a string
  if (typeof list === 'string') {
    list = (await gapi.client.tasks.tasklists.get({ tasklist: list })).result as gapi.client.tasks.Task;
  }

  let blockNew = await blockContentGenerate(list, task);

  console.debug(blockNew);

  await logseq.Editor.updateBlock(block.uuid, blockNew.content, { properties: blockNew.properties });

  // Handle notes and links update
  let res: any = await logseq.DB.datascriptQuery(`[:find (pull ?b [*]) :where [?b :block/parent ?a] [?a :block/uuid ?uuid] [(str ?uuid) ?str] [(= ?str "${block.uuid}")]]`);
  if (res) {
    console.debug(res);
    for (let child of res) {
      if (child[0].properties && (child[0].properties["google-task-context"] === "notes" || child[0].properties["google-task-context"] === "links")) {
        await logseq.Editor.removeBlock(child[0].uuid);
      }
    }
  }
  if (blockNew.children && blockNew.children.length > 0) {
    await logseq.Editor.insertBatchBlock(block.uuid, blockNew.children, { sibling: false });
  }
}

/**
 * Generates a batch block based on the provided task.
 * @param list - The task list object.
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
 */
async function blockContentGenerate(list: gapi.client.tasks.TaskList, task: gapi.client.tasks.Task): Promise<IBatchBlock> {
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
  taskBlock.properties["google-task-list-id"] = list.id;
  taskBlock.properties["google-task-list-ref"] = `[[GTasks/${list.title}]]`;
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
      properties: {
        'google-task-context': 'notes',
      },
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
      properties: {
        'google-task-context': 'links',
      },
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
async function generateParentName(list: gapi.client.tasks.TaskList, task: gapi.client.tasks.Task): Promise<string> {
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

/**
 * Pushes local changes to a Google Tasks task based on a Logseq block.
 * @param block - The Logseq block representing the task.
 * @param task - The Google Tasks task to be updated.
 * @returns A Promise that resolves when the task has been updated.
 */
async function pushLocalChanges(block: BlockEntity, task: gapi.client.tasks.Task) {
  const { preferredDateFormat } = await logseq.App.getUserConfigs();

  let needsUpdate = false;
  let taskNew = { ...task };
  let taskTitle = block.content
    .replace(/^(DONE|TODO)? /, '')
    .replace(/\nDEADLINE: [^\n]*/g, '')
    .replace(/\n[^\n]*:: [^\n]*/g, '')
    .replace(/^[^\n]*:: [^\n]*\n/g, '');
  if (taskTitle.trim() !== task.title?.trim()) {
    console.debug(taskTitle);
    console.debug(task.title);
    taskNew.title = taskTitle;
    needsUpdate = true;
  }

  // Handle status update
  if (block.marker === 'DONE' && task.status === 'needsAction') {
    taskNew.status = 'completed';
    // Logseq by default does not have completed date recorded for tasks.
    // This is now a feature provided by a plugin, which links to a jdournal,
    // page, there is a possiblity that completed date is not recorded.
    if (block.properties?.completed) {
      if (typeof block.properties?.completed == 'string') {
        taskNew.completed = format(parse((block.properties.completed || '').replace(/\[\[|\]\]/g, ''), preferredDateFormat, new Date()), 'yyyy-MM-dd') + 'T00:00:00.000Z'
      }
      else {
        taskNew.completed = format(parse(block.properties.completed[0], preferredDateFormat, new Date()), 'yyyy-MM-dd') + 'T00:00:00.000Z';
      }
    }
    needsUpdate = true;
  }
  if (block.marker === 'TODO' && task.status === 'completed') {
    taskNew.status = 'needsAction';
    delete taskNew.completed;
    needsUpdate = true;
  }

  // Handle deadline, format is 20240202
  if (block.deadline) {
    let deadlineFormatted = block.deadline.toString().slice(0, 4) + '-' + block.deadline.toString().slice(4, 6) + '-' + block.deadline.toString().slice(6, 8);
    if (!task.due || format(new Date(deadlineFormatted), 'yyyy-MM-dd') !== format(new Date(task.due as string), 'yyyy-MM-dd')) {
      console.debug(format(new Date(deadlineFormatted), 'yyyy-MM-dd') + 'T00:00:00.000Z');
      console.debug(task.due);
      taskNew.due = format(new Date(deadlineFormatted), 'yyyy-MM-dd') + 'T00:00:00.000Z';
      needsUpdate = true;
    }
  }

  // todo handle notes
  // Don't hanlde notes for now, as Logseq does not properly hanlde notes with newlines started '-'
  // Some imported notes are incomplete, we can't really tell if it is a bad import or a local update
  //let res = await logseq.DB.datascriptQuery(`[:find (pull ?b [*]) :where [?b :block/parent ?a] [?a :block/uuid ?uuid] [(str ?uuid) ?str] [(= ?str "${block.uuid}")]]`);
  //if (res) {
  //  for (let child of res) {
  //    if (child[0].properties["google-task-context"] === "notes") {
  //      let taskNotes = child[0].content
  //        .replace(/^(DONE|TODO)? /, '')
  //        .replace(/\nDEADLINE: [^\n]*/g, '')
  //        .replace(/\n[^\n]*:: [^\n]*/g, '')
  //        .replace(/^[^\n]*:: [^\n]*\n/g, '');
  //      if (taskNotes.trim() !== task.notes?.trim()) {
  //        console.debug(taskNotes);
  //        console.debug(task.notes);
  //        //taskNew.notes = taskNotes;
  //        //needsUpdate = true;
  //      }
  //    }
  //  }
  //}

  if (needsUpdate) {
    console.debug(block);
    console.debug(taskNew);

    await gapi.client.tasks.tasks.update({
      tasklist: block.properties?.["googleTaskListId"],
      task: taskNew.id,
      resource: taskNew,
    });

    let updatedTask = await gapi.client.tasks.tasks.get({
      tasklist: block.properties?.["googleTaskListId"],
      task: taskNew.id,
    });

    console.debug(updatedTask);

    updateTaskBlock(block, block.properties?.["googleTaskListId"] as string, updatedTask.result as gapi.client.tasks.Task);

    console.info(`#${pluginId}: ` + `Task ${task.id} has been changed locally`);
  }
}
