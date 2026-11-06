-- MA3 Remote Colours - grandMA3 plugin
--
-- Sends the colour presets (preset pool 4) of the selected datapool to the
-- MA3 Focus Buddy over OSC. The plugin only sends when the PWA asks for it:
--   Plugin "MA3 Remote Colours"   -> send presets START..START+COUNT-1
--
-- The preset range is fixed below (START and COUNT), so the PWA does not
-- pass any arguments. The OSC destination (IP address and port) comes from
-- the OSC line in Setup > In & Out > OSC. Set OSC_LINE below to the number
-- of that line (the same line the PWA uses to send commands to the console).
--
-- Messages sent to the PWA:
--   /ma3remote/colours/begin ,s <version>
--   /ma3remote/colour        ,is <preset number> <preset name>
--   /ma3remote/colours/end   ,i <preset count>

local OSC_LINE = 2      -- In & Out > OSC line that points at the PWA server
local POOL     = 4      -- preset pool 4 = Colour
local START    = 507    -- first preset number to send
local COUNT    = 101    -- how many presets to send (507..607)
local VERSION  = "1.0"

local function sendOSC(message)
    Cmd(string.format('SendOSC %d "%s"', OSC_LINE, message))
end

local function sendColours(first, last)
    local count = 0
    sendOSC('/ma3remote/colours/begin,s,' .. VERSION)

    local ok, presets = pcall(function() return DataPool().PresetPools[POOL] end)
    if ok and presets then
        for number = first, last do
            local okPreset, preset = pcall(function() return presets[number] end)
            if okPreset and preset then
                local name = tostring(preset.name or ''):gsub('"', "'")
                sendOSC(string.format('/ma3remote/colour,is,%d,%s', number, name))
                count = count + 1
            end
        end
    else
        Printf('MA3 Remote Colours: preset pool ' .. POOL .. ' not found in the selected datapool')
    end

    sendOSC(string.format('/ma3remote/colours/end,i,%d', count))
end

local function main()
    sendColours(START, START + COUNT - 1)
end

return main
