# User Preferences #

From any CyTube channel, you can click the Options link at the top of the page to open a dialog where you can change your personal preferences.  This page explains each of the available options.

## General ##

General interface preferences.

Setting | Description
--------|------------
Theme | Choose from different colorschemes for the website.
Layout | Choose from different layouts for elements on the page.  Fluid layouts will expand to fill the entire window, while compact layouts will remain the same size.  "Synchtube" layout is the same as the default layout, but mirrored.
Ignore Channel CSS | Don't load custom stylesheets for each channel.  Requires a refresh to take effect.
Ignore Channel JavaScript | Don't load custom scripts for each channel.  The Script Access tab allows you to manage your preferences on a per-channel basis, but if this setting is checked, scripts will be globally disallowed and you will not be prompted to accept them when joining a channel.

## Playback ##

Preferences for video playback and the playlist.

Setting | Description
--------|------------
Synchronize video playback | By default, CyTube attempts to synchronize the video so that everyone is watching at the same time.  Some users with poor internet connections may wish to disable this in order to prevent excessive buffering due to constantly seeking forward.
Synch threshold | The number of seconds your video is allowed to be ahead/behind before it is forcibly seeked to the correct position.  Should be set to at least 2 seconds to avoid buffering problems and choppy playback.
Set wmode=transparent | There's probably no reason to touch this unless you know what you're doing.  Having a non-transparent wmode can cause modals to display behind the video player, but also can cause performance issues in some situations.
Remove the video player | Automatically remove the video player on page load.  Equivalent to manually clicking Layout->Remove Video every time you load a channel.
Hide playlist buttons by default | Hides the control buttons from each video in the playlist, so that only the title is displayed.  The control buttons can be shown by right clicking the video item in the playlist.
Old style playlist buttons | Legacy feature introduced in CyTube 2.0 for those who preferred the old 1.0-style video control buttons.
Quality Preference | Sets the preferred quality for player types that support quality selection (currently, this is YouTube, Vimeo, Dailymotion, Google Drive, and Google+).  If your preferred quality is not available, the next lowest quality will be used.

## Chat ##

Preferences for the integrated chatroom.

Setting | Description
--------|------------
Show timestamps in chat | When enabled, a timestamp is prepended to each chat message.  For example, `[09:45:10] message here`.
Sort userlist by rank | Controls whether the username list is sorted alphabetically and by rank, or just alphabetically.
Sort AFKers to bottom | When enabled, usernames of AFK users will be sorted to the bottom of the username list.
Blink page title on new messages | Controls the conditions under which the tab title blinks between the channel title and `*Chat*` when a new message arrives.
Notification sound on new messages | Controls the conditions under which a notification sound is played when a new message arrives.
Add a send button to chat | Adds a clickable button to send chat messages.  Only really useful for virtual keyboards that lack a dedicated Enter key.
Disable chat emotes | Disables the automatic conversion of channel-defined emote codes to inline images.

## Script Access ##

Manage your preferences for allowing or denying custom scripts for channels you've visited.  A channel will only appear here if you checked "Remember my preference" when allowing or denying a channel script.  You can toggle the preference between "Allow" and "Deny", or click "Clear Preference" to remove the saved preference, so that you will be asked every time you join the channel.

## Moderator ##

Settings that only apply to channel moderators.

Setting | Description
--------|------------
Show name color | Colors your username in chat (the same color as in the username list).  This setting is also controlled by the small button labeled "M" in the upper right corner of chat.
Show join messages | Display a message every time a user logs in to the chat.
Show shadowmuted messages | Show chat messages from shadowmuted users.  These messages will appear ~~struck through~~, and only moderators with this setting enabled will see them.
