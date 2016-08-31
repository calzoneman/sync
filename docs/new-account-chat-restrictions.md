Restricting New Accounts from Chat
==================================

With the rising availability and popularity of VPNs and proxies, dedicated
trolls may often come back again and again with a new proxy after being IP
banned and continue spamming.  In order to combat this, a new feature has been
added to make it more difficult to rejoin quickly and continue spamming.

Channel moderators now have the ability to configure 2 different settings:

  * How long an account must be active before the user can send any chat message
  * How long an account must be active before the user can send a chat message
    containing a link

This limit applies to both chat messages sent to the channel as well as private
messages.  Both of these settings can be configured from the Channel Settings
menu at the top of the page, under the General Settings tab.  By default,
accounts must be at least 10 minutes old to chat, and 1 hour old to send links
in chat.  Setting either restriction to 0 will disable that restriction.

The age of an account is determined as follows:

  * If the user is logged in as a registered account, the registration time of
    the account is used.
  * Otherwise, the timestamp of the session cookie is used.

The session cookie is set whenever a user first joins a channel, and is reset
whenever the user's IP address changes.  Different browsers will have different
session cookies.
