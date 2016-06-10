local entries = redis.call('hgetall', 'publicChannelList')
if #entries == 0 then
    return '[]'
end

local channelList = {}
-- ARGV[1] holds the expiration timestamp.  Anything older than this
-- will be discarded.
local expiration = tonumber(ARGV[1])
for i = 1, #entries, 2 do
    local uid = entries[i]
    local entry = cjson.decode(entries[i+1])
    local timestamp = tonumber(entry['timestamp'])
    if timestamp < expiration then
        redis.call('hdel', 'publicChannelList', uid)
    else
        local channels = entry['channels']
        for j = 1, #channels do
            channelList[#channelList+1] = channels[j]
        end
    end
end

-- Necessary to check for this condition because
-- if the table is empty, cjson will encode it as an object ('{}')
if #channelList == 0 then
    return '[]'
else
    return cjson.encode(channelList)
end
