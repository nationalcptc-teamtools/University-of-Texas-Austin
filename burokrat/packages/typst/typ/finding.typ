#import "/typ/data.typ": *
#import "/typ/components.typ": *
#import "/typ/prose.typ": render-prose

#let scope-table(scope) = if scope.len() == 0 { [N/A] } else {
  let rows = ()
  for machine in scope {
    let services = if machine.services.len() == 0 { ((name: "N/A", port: "N/A"),) } else { machine.services }
    rows.push(text(machine.ip))
    rows.push(text(if machine.name == "" { "" } else { "(" + machine.name + ")" }))
    rows.push(text(services.first().name))
    rows.push(text(services.first().port))
    for svc in services.slice(1) {
      rows += ([], [], text(svc.name), text(svc.port))
    }
  }
  table(
    columns: (auto, 1fr, 1fr, 1fr),
    align: left,
    stroke: (x: none, y: 0.5pt + gray),
    table.hline(stroke: none),
    table.cell(colspan: 2)[*Host*], [*Service*], [*Port*],
    ..rows,
  )
}

#let mitre-list(techniques) = if techniques.len() == 0 { [N/A] } else {
  list(..techniques.map(t => [#link(t.url, text(fill: link-color, t.id)) --- #t.name]))
}

#let references-list(refs) = list(..refs.map(r => [
  #link(r.url, r.name) #text(fill: gray, size: 9pt)[(#r.domain)]
]))

// A finding in the full report is numbered as a level-3 heading.
#let vulnreport(f) = {
  let c = risk-colors.at(f.category)
  // Only a finding on its own is edited beside its preview.
  let mark(name) = if f.standalone { anchor(name) }

  block(
    width: 100%,
    fill: finding-bg,
    stroke: (left: 3pt + c.fg),
    inset: (x: 14pt, y: 12pt),
    radius: 2pt,
    breakable: true,
  )[
    #mark("title")
    #block(width: 100%, fill: c.bg, inset: (x: 10pt, y: 8pt), sticky: true)[
      #if f.standalone {
        text(weight: "bold", size: 16pt, fill: c.fg, f.title)
      } else {
        show heading: it => text(weight: "bold", size: 16pt, fill: c.fg)[#counter(heading).display() #it.body]
        heading(level: 3, f.title)
      }
    ]

    #v(10pt)

    #mark("rating")
    #block(breakable: false)[
      #grid(
        columns: (4cm, 3fr),
        gutter: 20pt,
        align(center)[
          #v(13pt)
          #section-label[Risk] \
          #v(-5pt)
          #risk-badge(f.riskLabel, f.category)
        ],
        table(
          columns: (1.1fr, 2.5fr),
          stroke: none,
          inset: 4pt,
          row-gutter: 8pt,
          [#section-label[Impact] \ #text(size: 14pt, f.impact)],
          [#section-label[CVSS Score] \ #text(size: 12pt, f.cvssScore)],

          [#section-label[Likelihood] \ #text(size: 14pt, f.likelihood)],
          [#section-label[CVSS Vector] \ #text(size: 12pt, f.cvssVector)],
        ),
      )
    ]

    #mark("scope")
    #section("Affected Scope", scope-table(f.scope))
    #mark("description")
    #section("Vulnerability Description", render-prose(f.description, f.images))
    #mark("businessImpact")
    #section("Business Impact Description", render-prose(f.businessImpact, f.images))
    #mark("mitre")
    #section("MITRE ATT&CK", mitre-list(f.mitre))
    #mark("exploitDetails")
    #section("Exploitation Details", render-prose(f.exploitDetails, f.images))
    #mark("remediation")
    #section("Remediation", render-prose(f.remediation, f.images))
    #mark("references")
    #if f.references.len() > 0 { section("References", text(fill: link-color, references-list(f.references))) }
  ]
}
