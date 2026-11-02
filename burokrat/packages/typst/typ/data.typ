// Everything the templates know comes from /data.json (see src/data.ts).
#let data = json("/data.json")

#let risk-colors = data.risk.colors.map(c => (fg: rgb(c.fg), bg: rgb(c.bg), box: rgb(c.box)))
#let level-names = data.risk.levels
#let link-color = rgb("#5c9ae6")

#let finding-bg = rgb("#f2f2f2")
