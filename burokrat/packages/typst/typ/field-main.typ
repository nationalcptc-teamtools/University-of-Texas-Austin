// Compiles one text field on its own, to tell which field breaks a document.
#import "/typ/data.typ": data
#import "/typ/components.typ": base-style
#import "/typ/prose.typ": render-field

#show: base-style
#render-field(data.field, data.images)
