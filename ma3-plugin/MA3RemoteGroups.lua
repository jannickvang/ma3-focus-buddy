-- MA3 Remote Groups - grandMA3 plugin
--
-- Sends the groups of datapool 2 to the MA3 Focus Buddy PWA over OSC.
-- The plugin only sends when the PWA asks for it:
--   Plugin "MA3 Remote Groups"          -> send the group list once
--   Plugin "MA3 Remote Groups" "start"  -> keep sending every INTERVAL seconds
--   Plugin "MA3 Remote Groups" "stop"   -> stop sending
--
-- The OSC destination (IP address and port) comes from the OSC line in
-- Setup > In & Out > OSC. Set OSC_LINE below to the number of that line
-- (the same line the PWA uses to send commands to the console).
--
-- Messages sent to the PWA:
--   /ma3remote/groups/begin ,s <version>
--   /ma3remote/group        ,is <group number> <group name>
--   /ma3remote/groups/end   ,i <group count>

local OSC_LINE = 2      -- In & Out > OSC line that points at the PWA server
local INTERVAL = 2.0    -- seconds between automatic updates in "start" mode
local DATAPOOL = 2      -- datapool that contains the groups
local VERSION  = "1.0"

local running = false

local function sendOSC(message)
    Cmd(string.format('SendOSC %d "%s"', OSC_LINE, message))
end

-- Find the datapool by its number. Different MA3 versions expose the pools
-- differently, so try the documented address forms first and then walk the
-- pool list comparing the pool number.
local function findDatapool(number)
    local ok, pool = pcall(function()
        return GetObject('DataPools')[tostring(number)]
    end)
    if ok and pool then return pool end

    ok, pool = pcall(function()
        return GetObject('DataPool ' .. number)
    end)
    if ok and pool then return pool end

    local okList, pools = pcall(DataPools)
    if okList and pools then
        for _, p in ipairs(pools:Children()) do
            if tonumber(p.no) == number then return p end
        end
    end
    return nil
end

local function sendGroups()
    local count = 0
    sendOSC('/ma3remote/groups/begin,s,' .. VERSION)

    local pool = findDatapool(DATAPOOL)
    local groups = pool and pool.Groups or nil
    if groups then
        for _, group in ipairs(groups:Children()) do
            local number = tonumber(group.no)
            local name = tostring(group.name or ''):gsub('"', "'")
            if number then
                sendOSC(string.format('/ma3remote/group,is,%d,%s', number, name))
                count = count + 1
            end
        end
    else
        Printf('MA3 Remote Groups: datapool ' .. DATAPOOL .. ' not found or has no Groups pool')
    end

    sendOSC(string.format('/ma3remote/groups/end,i,%d', count))
end

-- The first argument MA3 passes to a plugin function is the display handle;
-- the plugin arguments follow after it.
local function main(displayHandle, mode)
    if mode == 'stop' then
        running = false
        return
    end

    sendGroups()

    if mode == 'start' then
        running = true
        while running do
            local deadline = os.clock() + INTERVAL
            while running and os.clock() < deadline do end
            if running then sendGroups() end
        end
    end
end

return main
