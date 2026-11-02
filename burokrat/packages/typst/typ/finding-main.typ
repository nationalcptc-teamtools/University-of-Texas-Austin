#import "/typ/data.typ": data
#import "/typ/components.typ": anchor-positions, base-style, jump-positions, page-footer, page-header
#import "/typ/finding.typ": vulnreport

#show: base-style

#set page(
  margin: (top: 1in, bottom: 0.6in, left: 0.5in, right: 0.5in),
  header: page-header,
  footer-descent: 0pt,
  footer: page-footer,
)

#vulnreport(data.findings.first())
#anchor-positions()
#jump-positions()
