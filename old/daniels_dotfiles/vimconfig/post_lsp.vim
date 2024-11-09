" ########## vim plug section ##########
call plug#begin(stdpath('data') . '/plugged')
Plug 'dracula/vim'
Plug 'bluz71/vim-nightfly-colors', { 'as': 'nightfly' }
"Plug 'neoclide/coc.nvim', {'branch': 'release'}
Plug 'neovim/nvim-lspconfig'
Plug 'hrsh7th/nvim-cmp'
Plug 'hrsh7th/cmp-buffer'
Plug 'hrsh7th/cmp-nvim-lsp'
Plug 'saadparwaiz1/cmp_luasnip'
Plug 'L3MON4D3/LuaSnip'
Plug 'tpope/vim-fugitive'
" Plug 'scrooloose/nerdcommenter'
Plug 'jiangmiao/auto-pairs'
Plug 'tpope/vim-endwise'
Plug 'sirtaj/vim-openscad'
" Plug 'terryma/vim-multiple-cursors'
Plug 'alvan/vim-closetag'
Plug 'tpope/vim-characterize'
" Plug 'lervag/vimtex'
Plug 'nvim-treesitter/nvim-treesitter', {'do': ':TSUpdate'}  " We recommend updating the parsers on update
Plug 'nvim-treesitter/playground'
Plug 'editorconfig/editorconfig-vim'
Plug 'nvim-lua/plenary.nvim'
Plug 'nvim-telescope/telescope.nvim'
Plug 'nvim-telescope/telescope-fzy-native.nvim'
Plug 'ahmedkhalf/project.nvim'
Plug 'tpope/vim-surround'
Plug 'kyazdani42/nvim-web-devicons' " for file icons
Plug 'kyazdani42/nvim-tree.lua'
Plug 'kmonad/kmonad-vim'
Plug 'RRethy/nvim-align'
Plug 'stevearc/dressing.nvim'
Plug 'nfnty/vim-nftables'
Plug 'jeetsukumaran/vim-indentwise'
Plug 'mhartington/formatter.nvim'
call plug#end()
" ######################################

"runtime coc_bindings.vim
inoremap <silent> <SNR>16_AutoPairsReturn =AutoPairsReturn()

lua << EOF
local nvim_lsp = require('lspconfig')

-- Use an on_attach function to only map the following keys 
-- after the language server attaches to the current buffer
local on_attach = function(client, bufnr)
  local function buf_set_keymap(...) vim.api.nvim_buf_set_keymap(bufnr, ...) end
  local function buf_set_option(...) vim.api.nvim_buf_set_option(bufnr, ...) end

  --Enable completion triggered by <c-x><c-o>
  buf_set_option('omnifunc', 'v:lua.vim.lsp.omnifunc')

  -- Mappings.
  local opts = { noremap=true, silent=true }

  -- See `:help vim.lsp.*` for documentation on any of the below functions
  buf_set_keymap('n', 'gD', '<Cmd>lua vim.lsp.buf.declaration()<CR>', opts)
  buf_set_keymap('n', 'gd', '<Cmd>lua vim.lsp.buf.definition()<CR>', opts)
  buf_set_keymap('n', 'K', '<Cmd>lua vim.lsp.buf.hover()<CR>', opts)
  buf_set_keymap('n', 'gi', '<cmd>lua vim.lsp.buf.implementation()<CR>', opts)
  buf_set_keymap('n', '<C-k>', '<cmd>lua vim.lsp.buf.signature_help()<CR>', opts)
  buf_set_keymap('n', '<leader>wa', '<cmd>lua vim.lsp.buf.add_workspace_folder()<CR>', opts)
  buf_set_keymap('n', '<leader>wr', '<cmd>lua vim.lsp.buf.remove_workspace_folder()<CR>', opts)
  buf_set_keymap('n', '<leader>wl', '<cmd>lua print(vim.inspect(vim.lsp.buf.list_workspace_folders()))<CR>', opts)
  buf_set_keymap('n', '<leader>D', '<cmd>lua vim.lsp.buf.type_definition()<CR>', opts)
  buf_set_keymap('n', '<leader>rn', '<cmd>lua vim.lsp.buf.rename()<CR>', opts)
	buf_set_keymap('n', '<leader>ca', "<cmd>lua vim.lsp.buf.code_action()<CR>", opts)
  buf_set_keymap('n', 'gr', '<cmd>lua vim.lsp.buf.references()<CR>', opts)
  buf_set_keymap('n', 'gu', '<cmd>lua vim.lsp.buf.references()<CR>', opts)
  buf_set_keymap('n', '<leader>e', '<cmd>lua vim.diagnostic.open_float()<CR>', opts)
  buf_set_keymap('n', '[d', '<cmd>lua vim.diagnostic.goto_prev()<CR>', opts)
  buf_set_keymap('n', ']d', '<cmd>lua vim.diagnostic.goto_next()<CR>', opts)
  buf_set_keymap('n', '<leader>q', '<cmd>lua vim.diagnostic.setloclist()<CR>', opts)
  buf_set_keymap("n", "<leader>f", "<cmd>lua vim.lsp.buf.formatting()<CR>", opts)
	buf_set_keymap('n', 'gs', "<cmd>lua require'telescope.builtin'.lsp_workspace_symbols{}<CR>", opts)
end

local capabilities = vim.lsp.protocol.make_client_capabilities()
capabilities.textDocument.completion.completionItem.snippetSupport = true

-- Use a loop to conveniently call 'setup' on multiple servers and
-- map buffer local keybindings when the language server attaches
local servers = { "pyright", "tsserver", "rust_analyzer", "ansiblels" }
for _, lsp in ipairs(servers) do
  nvim_lsp[lsp].setup { 
		on_attach = on_attach;
	};
end

nvim_lsp.html.setup {
	on_attach = on_attach;
	capabilities = capabilities;
};
nvim_lsp.cssls.setup {
	on_attach = on_attach;
	capabilities = capabilities;
};
nvim_lsp.clangd.setup {
	on_attach = on_attach;
	cmd = { 'clangd', '--background-index' }
}
nvim_lsp.texlab.setup {
	-- cmd = {"texlab", "-vvvvv","--log-file", "/tmp/texlab.log"},
	on_attach = on_attach;
	settings = {
		texlab = {
			auxDirectory = "./.latexmk",
			build = {
				args = {"-lualatex" ,"-outdir=./.latexmk"},
				onSave = true,
				forwardSearchAfter = true
			},
			forwardSearch = {
				executable = "evince-synctex",
				args = {"-f", "%l", "%p", "\"code -g %f:%l\""}
			}
		}
	}
}

vim.o.completeopt = 'menuone,noselect'

local cmp = require 'cmp'
local types = require 'cmp.types'
local luasnip = require 'luasnip'

luasnip.setup({
	region_check_events = {"InsertEnter"}
})

cmp.setup {
	snippet = {
		expand = function(args)
			require('luasnip').lsp_expand(args.body)
		end,
	},
	mapping = {
		['<C-p>'] = cmp.mapping.select_prev_item(),
		['<C-n>'] = cmp.mapping.select_next_item(),
		['<C-d>'] = cmp.mapping.scroll_docs(-4),
		['<C-f>'] = cmp.mapping.scroll_docs(4),
		['<C-Space>'] = cmp.mapping.complete(),
		['<C-e>'] = cmp.mapping.close(),
		['<CR>'] = function(fallback)
			entry = cmp.get_selected_entry()
			if luasnip.expand_or_locally_jumpable() then
				luasnip.expand_or_jump()
			else
				fallback()
			end
		end,
		['<Tab>'] = function(fallback)
			if cmp.visible() then
				cmp.select_next_item()
			elseif luasnip.expand_or_locally_jumpable() then
				luasnip.expand_or_jump()
			else
				fallback()
			end
		end,
		['<S-Tab>'] = function(fallback)
			if cmp.visible() then
				cmp.select_prev_item()
			elseif luasnip.jumpable(-1) then
				luasnip.jump(-1)
			else
				fallback()
			end
		end,
	},
	sources = {
		{ name = 'nvim_lsp' },
		{ name = 'luasnip' },
		{ name = 'buffer' },
	},
	preselect = cmp.PreselectMode.None
}

require'my_snippets'

local t = function(str)
  return vim.api.nvim_replace_termcodes(str, true, true, true)
end

local check_back_space = function()
    local col = vim.fn.col('.') - 1
    if col == 0 or vim.fn.getline('.'):sub(col, col):match('%s') then
        return true
    else
        return false
    end
end

require'nvim-treesitter.configs'.setup {
	highlight = {
		enable = true,
	},
}

vim.lsp.handlers["textDocument/publishDiagnostics"] = vim.lsp.with(
  vim.lsp.diagnostic.on_publish_diagnostics, {
		severity_sort = true,
  }
)

require("project_nvim").setup {}

local telescope = require('telescope')
telescope.setup{
  defaults = {
    -- Default configuration for telescope goes here:
    -- config_key = value,
    -- ..
  },
  pickers = {
    -- Default configuration for builtin pickers goes here:
    -- picker_name = {
    --   picker_config_key = value,
    --   ...
    -- }
    -- Now the picker_config_key will be applied every time you call this
    -- builtin picker
  },
  extensions = {
    -- Your extension configuration goes here:
    -- extension_name = {
    --   extension_config_key = value,
    -- }
    -- please take a look at the readme of the extension you want to configure
  }
}
telescope.load_extension('fzy_native')
telescope.load_extension('projects')

require'my_nvimtree'

require'dressing'.setup{
	input = {
		insert_only = false,
	},
}

local prettier = require("formatter.defaults.prettier")
local futil = require("formatter.util")
require("formatter").setup{
	logging = true,
	log_level = vim.log.levels.WARN,
	filetype = {
		html = { prettier, },
		javascript = { prettier, },
		typescript = { futil.withl(prettier, "typescript"), },
		json = { futil.withl(prettier, "json"), },
		css = { futil.withl(prettier, "css"), },
		xml = {
			function()
				return {
					exe = "xmllint",
					args = {
						"--format",
						futil.escape_path(futil.get_current_buffer_file_path()),
					},
					stdin = true,
				}
			end
			},
	}
}
EOF

" autocmd BufEnter * colorscheme dracula
" autocmd BufEnter *.tex colorscheme nightfly

nnoremap <leader>gf :lua require'telescope.builtin'.find_files{}<CR>
nnoremap <leader>gr :lua require'telescope.builtin'.live_grep{}<CR>
nnoremap <leader>gm :lua require'telescope.builtin'.man_pages{}<CR>
nnoremap <leader>gc :lua require'telescope.builtin'.tags{}<CR>
nnoremap gt :lua require'telescope.builtin'.treesitter{}<CR>

nnoremap <C-n> :NvimTreeFocus<CR>
nnoremap <leader>n :NvimTreeFindFile<CR>
