local ls = require"luasnip"
local s = ls.snippet
local sn = ls.snippet_node
local isn = ls.indent_snippet_node
local t = ls.text_node
local i = ls.insert_node
local f = ls.function_node
local c = ls.choice_node
local d = ls.dynamic_node
local r = ls.restore_node
local events = require("luasnip.util.events")
local ai = require("luasnip.nodes.absolute_indexer")

function duplicate(args, snip)
	return args[1]
end

ls.add_snippets(nil, {
	all = {},
	tex = {
		s("beg", {
			t("\\begin{"), i(1), t("}"),
			t({"", "	"}), i(0),
			t({"", "\\end{"}),
			f(duplicate, {1}),
			t("}")
		}),
		s("frac", {
			t("\\frac{"), i(1), t("}{"), i(2), t("}"), i(0)
		}),
		s("tx", {
			t("\\text{"), i(1), t("}"), i(0)
		}),
		s("sec", {
			t("\\section{"), i(1), t("}"), i(0)
		}),
		s("ssec", {
			t("\\subsection{"), i(1), t("}"), i(0)
		}),
		s("qu", {t("``"), i(1), t("''"), i(0)}),
		s("br", {
			t("\\{"), i(0), t("\\}")
		}),
		s("m", {t("$"), i(0), t("$")}),
		s("e", {t("$$"), i(0), t("$$")}),
		s("eq", {
			t("\\begin{equation*}"),
			t({"", "	"}), i(0),
			t({"", "\\end{equation*}"}),
		}),
		s("al", {
			t("\\begin{align*}"),
			t({"", "	"}), i(0),
			t({"", "\\end{align*}"}),
		}),
		s("lr", {
			t("\\left"), i(1),
			i(0),
			t("\\right"), i(2)
		})
	},
	cpp = {
		s("ig", {
			t("#ifndef "), i(1),
			t({"", "#define "}), f(duplicate, {1}),
			t({"", "", ""}),
			i(0),
			t({"", "", "#endif /* "}), f(duplicate, {1}), t(" */")
		})
	},
}, nil)

ls.filetype_extend("c", {"cpp"})
