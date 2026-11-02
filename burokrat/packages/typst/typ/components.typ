#import "/typ/data.typ": *

// The type and spacing every document and field check starts from.
#let base-style(body) = {
  set text(font: "Hanken Grotesk", size: 11pt)
  set par(justification-limits: (tracking: (min: -0.01em, max: 0.02em)))
  body
}

#let page-header = context [
  *#data.company Security Assessment*
  #h(1fr)
  *#data.team*
  #line(length: 100%, stroke: 0.5pt)
]

// Spans the 0.5in side margins and sits on the page's bottom edge, with `footer-descent: 0pt`.
#let page-footer = context align(bottom, move(dx: -0.5in, block(
  width: 100% + 1in,
  fill: luma(225),
  inset: (x: 0.5in, y: 9pt),
)[
  #set text(weight: "bold")
  #grid(
    columns: (1fr, auto, 1fr),
    [], text(fill: red)[CONFIDENTIAL - DO NOT DISTRIBUTE], align(right, counter(page).display()),
  )
]))

#let risk-badge(label, category) = {
  let c = risk-colors.at(category)
  let size = if label.len() > 8 { 10pt } else { 13pt }
  let badge(fill, color) = box(
    fill: fill,
    radius: 2pt,
    inset: (x: 12pt, y: 8pt + (13pt - size) / 2),
    text(fill: color, weight: "bold", size: size, hyphenate: false, label),
  )
  box(place(dx: 3pt, dy: 3pt, badge(black.transparentize(70%), white.transparentize(100%))) + badge(c.box, white))
}

#let section-label(t) = text(weight: "bold", size: 13pt, t)

// Where an editor field's content starts, so the live preview can scroll to it.
#let anchor(name) = [#metadata(name) <anchor>]

#let anchor-positions() = context [#metadata(
  query(<anchor>).map(m => {
    let position = m.location().position()
    (name: m.value, page: position.page, y: position.y / page.height)
  }),
) <anchors>]

// Where each word the live preview marked in an editor field landed, so a click can find its source.
#let jump-positions() = context [#metadata(
  query(<jump>)
    .filter(m => m.func() == metadata)
    .map(m => {
      let position = m.location().position()
      let (field, offset) = m.value
      (field: field, offset: offset, page: position.page, x: position.x / page.width, y: position.y / page.height)
    }),
) <jumps>]

// A section's label stays on the page where its content starts; the content breaks freely.
#let section(label-text, content) = {
  block(sticky: true, above: 23pt, below: 7pt, section-label(label-text))
  content
}

#let asset-path(name) = {
  assert(
    name.matches(regex("^[A-Za-z0-9._-]+$")).len() == 1 and not name.starts-with("."),
    message: "invalid asset name: " + name,
  )
  "/assets/" + name
}

#let evidence(asset, width, caption) = {
  let cap-empty = caption in (none, "", [])
  show figure.caption: set text(size: 9pt, style: "italic")
  block(above: 1.4em, below: 0.4em, figure(
    image(asset-path(asset), width: width),
    caption: figure.caption(
      separator: if cap-empty { none } else { [: ] },
      if cap-empty { [] } else { caption },
    ),
  ))
}

#let table-header = rgb("#1f2433")
#let table-label = luma(242)

#let frame = (stroke: 3pt + luma(205), radius: 4pt, clip: true)

#let framed(body) = box(..frame, body)

#let level-cell(category, label: none) = table.cell(
  fill: risk-colors.at(category).box,
  text(fill: white, weight: "bold", hyphenate: false, if label == none { upper(level-names.at(category)) } else {
    label
  }),
)

#let report-table(..args) = table(
  stroke: 1pt + luma(215),
  inset: 9pt,
  align: center + horizon,
  ..args,
)

#let header-cell(body, colspan: 1) = table.cell(
  colspan: colspan,
  fill: table-header,
  text(fill: white, weight: "bold", body),
)

#let findings-count() = {
  let risks = data.findings.map(f => f.category)
  let shown = (4, 3, 2, 1) + if 0 in risks { (0,) } else { () }
  figure(
    framed(report-table(
      columns: (1.3in,) * shown.len(),
      ..shown.map(r => level-cell(r, label: if r == 0 { "INFO" })),
      ..shown.map(r => str(risks.filter(x => x == r).len())),
    )),
    kind: image,
    caption: [Total Findings by Risk Level],
  )
}

#let risk-matrix() = {
  let label(body) = table.cell(fill: table-label, strong(body))
  figure(
    framed(report-table(
      columns: (1.3in,) * 5,
      header-cell[IMPACT],
      header-cell(colspan: 4)[LIKELIHOOD],
      table.cell(fill: table-label)[],
      ..level-names.slice(1).map(label),
      ..range(4).map(i => (label(level-names.at(i + 1)), ..data.risk.matrix.at(i).map(level-cell))).flatten(),
    )),
    kind: image,
    caption: [Matrix for Determining Risk Levels],
  )
}

// A table as wide as the page that breaks across pages, its header row repeating.
#let long-table(caption, columns, header, rows) = {
  show figure: set block(breakable: true)
  figure(
    block(..frame, breakable: true, report-table(
      columns: columns,
      align: left + horizon,
      table.header(..header.map(header-cell)),
      ..rows,
    )),
    kind: image,
    caption: caption,
  )
}

#let or-na(value) = if value == "" { "N/A" } else { value }

#let hosts-table() = if data.hosts.len() == 0 { [N/A] } else {
  long-table(
    [Hosts in Scope],
    (1.2fr, 1.5fr, 1.5fr, 2fr),
    ([IP address], [Hostname], [Operating system], [Ports]),
    data.hosts.map(h => (
      h.ip,
      or-na(h.hostname),
      or-na(h.os),
      if h.services.len() == 0 { "N/A" } else { h.services.map(s => s.port).join(", ") },
    )).flatten(),
  )
}

#let services-table() = {
  let rows = data.hosts.map(h => h.services.map(s => (
    [#h.ip \ #text(size: 9pt, if h.hostname == "" { "N/A" } else { "(" + h.hostname + ")" })],
    s.port,
    or-na(s.name),
    or-na(s.product),
  ))).flatten()
  if rows.len() == 0 { [N/A] } else {
    long-table(
      [Services in Scope],
      (2fr, 1fr, 1.5fr, 2.5fr),
      ([Host], [Port], [Service], [Version]),
      rows,
    )
  }
}

#let definition-table(name, rows) = framed(report-table(
  columns: (1.6in, 4.7in),
  header-cell(colspan: 2, name),
  ..rows
    .map(((category, body)) => (
      level-cell(category),
      table.cell(align: left + horizon, par(justify: true, body)),
    ))
    .flatten(),
))

#let risk-definitions() = {
  figure(definition-table("IMPACT", data.risk.definitions.impact), kind: image, caption: [Description of Impact Levels])
  figure(
    definition-table("LIKELIHOOD", data.risk.definitions.likelihood),
    kind: image,
    caption: [Description of Likelihood Levels],
  )
  [A finding is rated *Informational* overall when either its impact or its likelihood is Informational; otherwise its overall risk comes from the matrix above.]
}

#let report-cover(cover) = {
  if cover.background != none {
    page(margin: 0pt, header: none, footer: none, image(
      asset-path(cover.background),
      width: 100%,
      height: 100%,
      fit: "cover",
    ))
  } else {
    let ruled(body) = grid(
      columns: (1fr, auto, 1fr),
      column-gutter: 8pt,
      align: horizon,
      line(length: 100%), body, line(length: 100%),
    )
    page(header: none, footer: none)[
      #set align(center)
      #set par(justify: false)
      #v(1fr)
      #if cover.logo != none { image(asset-path(cover.logo), width: 50%) }
      #v(1fr)
      #ruled(text(size: 11pt, if cover.subtitle == "" { data.team } else { cover.subtitle }))
      #text(size: 30pt, weight: "bold", tracking: 3pt, upper(if cover.title == "" {
        "Security Assessment Report"
      } else { cover.title }))
      #ruled(text(size: 11pt, cover.date))
      #v(1.5fr)
    ]
  }
}
