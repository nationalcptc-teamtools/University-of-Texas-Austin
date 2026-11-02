#import "/typ/data.typ": data, level-names
#import "/typ/components.typ": anchor, anchor-positions, base-style, jump-positions, page-footer, page-header, report-cover
#import "/typ/finding.typ": vulnreport
#import "/typ/prose.typ": render-field

#show: base-style
#set par(justify: true)
#set heading(numbering: "1.1")

#show heading.where(level: 1): it => {
  pagebreak(weak: true)
  block(width: 100%, below: 1.2em, sticky: true)[
    #text(size: 20pt, weight: "bold")[#counter(heading).display() #h(0.7em) #it.body]
    #v(-0.3em)
    #line(length: 100%, stroke: 0.5pt)
  ]
}
#show heading.where(level: 2): it => block(above: 1.4em, below: 0.8em, sticky: true,
  text(size: 13pt, weight: "bold")[#counter(heading).display() #h(0.7em) #it.body])

#show outline.entry.where(level: 1): it => { v(1em, weak: true); strong(it) }

#anchor("cover")
#report-cover(data.report.cover)

#set page(
  margin: (top: 1in, bottom: 0.9in, left: 0.5in, right: 0.5in),
  header: page-header,
  footer-descent: 0pt,
  footer: page-footer,
)
#counter(page).update(1)

= Table of Contents
#outline(title: none, depth: 3, indent: auto)

#anchor("prologue")
#render-field(data.report.prologue, data.report.images)

#anchor("findings")
= Findings
#{
  let current = none
  for (i, f) in data.findings.enumerate() {
    if i > 0 { pagebreak() }
    if f.category != current {
      current = f.category
      heading(level: 2, level-names.at(current) + " Risk Findings")
    }
    vulnreport(f)
  }
}

#anchor("epilogue")
#render-field(data.report.epilogue, data.report.images)
#anchor-positions()
#jump-positions()
