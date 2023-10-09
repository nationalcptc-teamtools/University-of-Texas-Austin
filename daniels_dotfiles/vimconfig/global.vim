set nocp

if has("vms")
	set nobackup		" do not keep a backup file, use versions instead
else
	set backup		" keep a backup file (restore to previous version)
	if has('persistent_undo')
		set undofile	" keep an undo file (undo changes after closing)
	endif
endif

if &t_Co > 2 || has("gui_running")
	" Switch on highlighting the last used search pattern.
	set hlsearch
endif

" Only do this part when compiled with support for autocommands.
if has("autocmd")
	" Put these in an autocmd group, so that we can delete them easily.
	augroup vimrcEx
	au!
	" For all text files set 'textwidth' to 78 characters.
	autocmd FileType text setlocal textwidth=78
	augroup END

	set rnu
	augroup numbertoggle
		autocmd!
		autocmd BufEnter,FocusGained,InsertLeave,WinEnter * if &nu && mode() != "i" | set rnu		| endif
		autocmd BufLeave,FocusLost,InsertEnter,WinLeave		* if &nu									| set nornu | endif
	augroup END
else
	set autoindent		" always set autoindenting on
endif " has("autocmd")

let g:netrw_browsex_viewer= "gio open"
nnoremap <silent> gx :execute 'silent! !gio open ' . shellescape(expand('<cWORD>'), 1)<cr>

" -- Display
set title
set number
set ruler

set scrolloff=3

" -- Search
set ignorecase
set smartcase

set backspace=indent,eol,start

" -- Syntax highlighting
filetype on
filetype plugin on
filetype indent on

set hidden

" Tabs
set tabstop=2
set shiftwidth=2
set noexpandtab
set listchars=eol:$,tab:——→,trail:~,space:·,nbsp:\|
"set list

set splitright

" Remap ESC
imap <S-Tab> <Esc>
nnoremap Y y$
nnoremap <leader>v '[v']
nnoremap <leader>V '[V']

set mouse=nvi
set mouseshape="n:beam,v:beam,o:beam,i:beam,r:beam,e:arrow,s:udsizing,sd:udsizing,vs:lrsizing,vd:lrsizing"
set guifont=Fira\ Code:h10

set termguicolors
"let g:dracula_colorterm = 0

map <ScrollWheelUp> <C-Y>
map <S-ScrollWheelUp> <C-U>
map <ScrollWheelDown> <C-E>
map <S-ScrollWheelDown> <C-D>
map <ScrollWheelRight> <zl>
map <ScrollWheelLeft> <zh>

set nobackup
execute "set undodir=".$HOME."/.config/nvim/tmp"

command Bd bp\|bd \#
command BD bp\|bd \#
tnoremap <S-CR> <C-\><C-n>

function! WC()
	let filename = expand("%")
	let cmd = "detex " . filename . " | wc -w | tr -d [:space:]"
	let result = system(cmd)
	echo result . " words"
endfunction
command WC call WC()

color dracula
let g:tex_flavor = 'latex'
"autocmd Filetype tex set conceallevel=1
"let g:vimtex_syntax_conceal = {
"			\ 'accents': 1,
"			\ 'cites': 1,
"			\ 'fancy': 1,
"			\ 'greek': 1,
"			\ 'math_bounds': 1,
"			\ 'math_delimiters': 1,
"			\ 'math_fracs': 0,
"			\ 'math_super_sub': 0,
"			\ 'math_symbols': 1,
"			\ 'sections': 1,
"			\ 'styles': 1,
"			\}
let g:vimtex_fold_manual = 1
let g:vimtex_matchparen_enabled = 0
let g:vimtex_complete_enabled = 0
let g:vimtex_compiler_enabled = 0
let g:vimtex_view_enabled = 0
autocmd Filetype tex setlocal spell
autocmd Filetype markdown setlocal spell
