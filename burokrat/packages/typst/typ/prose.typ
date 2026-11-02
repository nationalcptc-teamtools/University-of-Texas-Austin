// Renders a text field's Typst markup. Fields only see the names in `scope`, the
// standard library, and the assets mapped for this compile.
#import "/typ/data.typ": *
#import "/typ/components.typ": *

// `images` maps the names a field may show to their asset and default caption.
#let scope(images) = (
  company: data.company,
  team: data.team,
  findings-count: findings-count(),
  risk-matrix: risk-matrix(),
  risk-definitions: risk-definitions(),
  image: (name, width: 60%, caption: auto) => {
    let found = images.at(name, default: none)
    if found == none { text(fill: red)[[image "#name" not found]] }
    else { evidence(found.asset, width, if caption == auto { found.caption } else { caption }) }
  },
)

// A field that failed its own compile: Typst's message and the source, so the rest still renders.
#let field-error(field) = block(width: 100%, inset: 8pt, radius: 2pt, fill: rgb("#fdecea"), stroke: (left: 2pt + red))[
  #text(fill: red, weight: "bold", size: 9pt)[Typst error: #field.error]
  #raw(field.source, block: true)
]

#let render-field(field, images) = {
  if field.error != none { field-error(field) }
  else { eval(field.source, mode: "markup", scope: scope(images)) }
}

// Finding fields read "N/A" when empty.
#let render-prose(field, images) = if field.source.trim() == "" { [N/A] } else { render-field(field, images) }
