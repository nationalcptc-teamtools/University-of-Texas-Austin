# CPTC Report Automation

Currently there are two versions of the report template. One uses a python script that reads the JSON files, creates a TeX file and compiles to PDF while the other uses an embedded Lua script that is called automatically by LuaLaTeX. The main difference is that the Python script allows more configuration options and supports a folder of JSONs rather than a singular JSON.

## Setup
- Download and Install [MiKTeX](https://miktex.org/)
- Use MiKTeX console/CLI to update LaTeX packages to latest versions
- Create JSON data for vulnerabilities (single JSON for Lua or folder of JSONs for python)
- For Lua: Edit the file path (must be absolute path) in `cptc.lua:57` and compile pdf by running `lualatex cptc-lua-report.tex`
- For Python: compile pdf by running `python latex.py` (adding the `-h` flag will show additional configuration options)