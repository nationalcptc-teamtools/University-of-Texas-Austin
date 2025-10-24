local json = require('json')

local Vulnerability = {}
Vulnerability.__index = Vulnerability

local severityOrder = { Critical = 1, High = 2, Medium = 3, Low = 4 }

local function capitalize(str)
    return str:sub(1, 1):upper() .. str:sub(2):lower()
end

function Vulnerability:new(json_data)
    local obj = {}
    setmetatable(obj, Vulnerability)
    obj.title = json_data.title
    obj.severity = json_data.severity
    obj.severity.overall = capitalize(obj.severity.overall)
    obj.severity.impact = capitalize(obj.severity.impact)
    obj.severity.likelihood = capitalize(obj.severity.likelihood)
    obj.scope = json_data.scope
    obj.description = json_data.description
    obj.impact = json_data.impact
    obj.confirmation = json_data.confirmation
    obj.remediation = json_data.remediation
    obj.references = json_data.references
    return obj
end

function Vulnerability:print_latex(order_num)
    tex.sprint("\\vulnreport[")
    tex.sprint("title={" .. severityOrder[self.severity.overall] .. "." .. order_num .. " " .. self.title .. "},")
    tex.sprint("category={" .. self.severity.overall .. "},")
    tex.sprint("impact={" .. self.severity.impact .. "},")
    tex.sprint("likelihood={" .. self.severity.likelihood .. "},")
    tex.sprint("scope={" .. self.scope .. "},")
    tex.sprint("description={" .. self.description .. "},")
    tex.sprint("impactdesc={" .. self.impact .. "},")
    tex.sprint("confirmation={" .. self.confirmation .. "},")
    tex.sprint("remediation={" .. self.remediation .. "},")
    tex.sprint("references={" .. self.references .. "}")
    tex.sprint("]")
end

local function compareVulnerabilities(a, b)
    if severityOrder[a.severity.overall] ~= severityOrder[b.severity.overall] then
        return severityOrder[a.severity.overall] < severityOrder[b.severity.overall]
    elseif severityOrder[a.severity.impact] ~= severityOrder[b.severity.impact] then
        return severityOrder[a.severity.impact] < severityOrder[b.severity.impact]
    elseif severityOrder[a.severity.likelihood] ~= severityOrder[b.severity.likelihood] then
        return severityOrder[a.severity.likelihood] < severityOrder[b.severity.likelihood]
    else
        return a.title < b.title
    end
end

local function get_vuln_data()
    local file = io.open('C:\\Users\\ameya\\Documents\\School\\HASH\\cptc-scripts\\LaTeX\\vulns.json', 'r')
    if file == nil then
        print('error nil file')
    end
    local content = file:read("*all")
    file:close()

    local data = json.decode(content)

    local vuln_list = {}
    for _, v in ipairs(data) do
        table.insert(vuln_list, Vulnerability:new(v))
    end

    table.sort(vuln_list, compareVulnerabilities)

    return vuln_list
end

local function get_color_command(severity)
    if severity == "Critical" then
        return "criticalcolor"
    elseif severity == "High" then
        return "highcolor"
    elseif severity == "Medium" then
        return "mediumcolor"
    elseif severity == "Low" then
        return "lowcolor"
    else
        return "infocolor"
    end
end

local function print_vuln_table()
    local vuln_list = get_vuln_data()
    tex.sprint("\\begin{tabularx}{\\textwidth}{|Z|V|X|}")
    tex.sprint("\\hline")
    tex.sprint("\\rowcolor{gray} \\textbf{Risk} & \\textbf{Vulnerability} & \\makecell[c]{\\textbf{Affected Scope}}\\\\")
    tex.sprint("\\hline")
    for _, v in ipairs(vuln_list) do
        tex.sprint('\\cellcolor{\\' ..
        get_color_command(v.severity.overall) ..
        '}\\textcolor{white}{\\textbf{' ..
        v.severity.overall .. '}}  & ' .. v.title .. ' & \\makecell[l]{' .. v.scope .. '} \\\\')
        tex.sprint('\\hline')
    end
    tex.sprint("\\end{tabularx}")
end

local function print_all_vulns()
    local vuln_list = get_vuln_data()
    local prev = ""
    local num = 0
    for i, v in ipairs(vuln_list) do
        if v.severity.overall == prev then
            num = num + 1
        else
            prev = v.severity.overall
            num = 1
        end
        if i > 1 then
            tex.sprint("\\newpage")
        end
        v:print_latex(num)
    end
end

return { VulnTable = print_vuln_table, VulnDetails = print_all_vulns }
