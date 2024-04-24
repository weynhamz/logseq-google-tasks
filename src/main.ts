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

  let blocksList = await Promise.all(taskLists.map(
    async (taskList: any) => {
      let pageName = "GTasks/" + taskList.title;
      let pageEntity = await ensurePage(pageName, false);
      if (!pageEntity) {
        throw new Error("Unable to create page for task list.");
      }

      let tasks = await fetchTasks(taskList.id);

      let taskBlocks = await Promise.all(tasks?.map(blockContentGenerate) ?? []);

      return [pageEntity.uuid, taskBlocks];
    }
  ));

  blocksList.map((list: any) => {
    let [uuid, blocks] = list;
    logseq.Editor.insertBatchBlock(uuid, blocks);
  });
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
    let response: any = await gapi.client.tasks.tasks.list({
      'tasklist': taskListId,
      'pageToken': nextPageToken,
      'maxResults': 100,
      'showHidden': true,
      'showDeleted': true,
      'showCompleted': true,
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
async function blockContentGenerate(task: any): Promise<IBatchBlock> {
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
