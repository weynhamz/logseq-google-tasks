Logseq Plugin Google Tasks
==========================

A Logseq plugin that does bidirectional synchoroization with Google Tasks.


## Set up

Hasn't figured out a best way to perform Google Oauth2 with Logseq plugin yet, currently, user needs to maually get `access_token` and then add to Logseq plugin settings. Google's access token expires around 1 hour. If anyone has a better way of solving this, suggetions and PRs are welcome.

For now, follow till "Authorize credentials for a desktop application" section of this document https://developers.google.com/tasks/quickstart/nodejs, save the `credentials.json` to auth/ folder and then run `pnpm node index.js`, the access_token will be printed on the screen, grab it and save it in the plugin settings, valid for one hour.

## Usage

`Cmd + Shift + P` search for `Sync Google Tasks` command.


## Current Behavior

The principle this plugin follows is that, the task should be logged as part of the journal upon creation, then use block reference to plan it in the on-going daily aganda. As Google Tasks doesn't really record the creation time of a task, this plugin will do its best to determine the creation date by comparing the updated time and due date of a task, and insert the task to corresponding journal page.

It will use block attributes to keep task id, task list id, task updated time for reference, and reference the task list locally as `GTasks/TaskListTitle`.

Local changes to synced task will also be pushed to Google Tasks only if the local recorded gtask updated time is the same as remote, if not, local will be updated, and local change will be lost.

Don't change any of the `google-task-*` block attributes.


## Stories Backlog

* DONE Add a Logseq command to sync Google Tasks to Logseq `GTasks/${TaskListTitle}` pages.
    * Record important metadata as Logseq block attributes.
    * Google Task should be synced as Logseq Task natively, including task marker, deadline, completion date etc.
* DONE New Google Task should be synced down to Logseq upon each synchoronization.
* DONE Changes on Google Task for already synced task should be updated upon each synchoronization.
    * Handl children `notes` and `links` blocks as well.
* DONE Sync Google Task to Logseq Journal pages rather than `GTasks/${TaskListTitle}` pages.
    * Google Task should be inerted to the journal page as close as possible of its creation date.
    * Use updatetime or due date as the creation time of the tasks.
* CANCELED Handle move a Google Task between Task list in Logseq properly.
    * Should move bettwen pages in `GTasks/${TaskListTitle}` pLogseq.
    * This work is no longer needed, if tasks are added directly to journal pages, only refernece `GTasks/${TaskListTitle}`.
    * Keep all tasks in a task list page also cause performance degreedation if tasks list is huge.
* DONE Changes of synced Logseq tasks should be pushed to Google Tasks as well.
    * Happens on full synchoronization.
    * Compare the recorded update timestamp, only update Google Tasks if the timestamp is same.
    * if local update is bigger than the remote, it should be updated.
        * DAMN, Logseq doesn't record updated time on block level reliably.
    * Compare the local is same as remote, content wise.
        * Task title / Deadline / Status
      * Also update remote compeleting date.
      * Make sure the updated time stamp is same after push to remote.
* DONE Warn if the access token is expired.
* DONE Show settings UI upon token expiration.
* TODO Add a Block context action to update/push a single task.
* TODO For completed Google Tasks, there is a possibility that compelition time could potentially earlier than due and updated.
* TODO Introduce a force sync command. Currently, if recorded updated time is the same, no update will happen.
* TODO Handle parent relationship upon task creation.
* TODO Handle repeat of the deadline upon task creation.
* TODO Map Google Task List to more Logseq custom pages.
* TODO Record the last sync time, and use updateMin to only tasks changed since last sync.
* TODO Sync locally created Logseq task to Google Tasks somehow.
* TODO Deletion in Google Tasks should be reflected in Logseq.
    * As the sync is pulling, this is hard to implement.
    * Consier to have a separate house keeping command maybe.
* TODO Deletion in Logseq should be reflected in Google Tasks.
    * Map Logseq CANCEL status Google Task 'hidden' attribute, but doesn't really delete it?
    * If a task is deleted in Logseq, it should be deleted in Google tasks?? Pop up a confirmation?
* TODO Add a nice progress bar to show the synchoronization status.
* TODO Implement Google OAuth2 in a better streamline manner.
* DONE How updated works in Gtasks api, automated?
    * Looks like it is
* TODO Add test coverage to make sure stable iteration.
