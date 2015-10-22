## Please do not use chat filters for emoticons! ##

CyTube has an emotes feature which is better-suited for adding emoticons.
Adding them as chat filters is more difficult to manage and uses more server
resources.

## Managing Chat Filters ##

You can access the Chat Filters editor by clicking on "Channel Settings" at the
top of the page, then the "Edit" dropdown, and selecting "Chat Filters".

### Adding a New Chat Filter ###

The first field allows you to enter a unique name for the filter.  This can be
anything you like, but it must be unique among all filters on your channel.

The "Filter regex" field is where you input the [regular
expression](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp)
that you would like to match.  Regular expressions allow you to build
sophisticated filters that can find and replace patterns rather than simple
words.  If you simply want to filter a word, you can just use `\bword\b`, as
long as the word does not contain any of the special characters listed on the
linked regular expression guide.  The leading and trailing `\b` ensure that you
only match the whole word "word", and do not match instances where it is nested
inside other words.

If you're looking for a way to test your regular expression, there are many free
tools available online, such as [this one](http://regexpal.com/).

The "Flags" field allows you to control certain aspects of matching.  The "g"
flag specifies that replacement will be done "globally"-- it will replace all
instances of the regular expression instaed of just the first one.  The "i" flag
makes matching case-insensitive, so that the capitalization of the message
doesn't matter.  Flags can be combined by putting both of them in the box, e.g.
"gi".

The "Replacement" field is where you specify the text to be substituted for the
original messagse.  This allows a limited subset of HTML tags to be used.

## Editing Filters ##

From the chat filter list, you can drag and drop filters to rearrange the order
in which they are executed.  For each filter, there are two buttons.  The left
button allows you to edit the filter, to update the regular expression, flags,
replacement, and whether or not the filter should be applied to links inside of
messages (this defaults to off).  The red trash can button removes the filter.

## Export/Import ##

The export/import feature allows you to back up your filter list and restore it
later, or clone filters to a new channel.  Clicking "Export filter list" will
populate the below textarea with a JSON encoded version of the filter list.
Copy this and save it somewhere safe.  Later, you can paste this same text back
into the box and click "Import filter list" to overwrite your current filters
with the exported list.

## Notes ##

  * By default, CyTube automatically replaces URLs in chat messages with
    clickable links.  You can disable this from the "Chat Settings" section
    under the "General Settings" tab.
  * By default, chat filters will not replace text inside of links, to prevent
    them from being broken by the filter.  You can override this by editing the
    filter and checking the "Filter Links" box.
  * Incoming messages have HTML special characters sanitized before messages are
    filtered.  You will have to account for this if you want to filter these
    characters.  For example, instead of matching `<`, you must match `&lt;`.
