" ########## vim plug section ##########
call plug#begin(stdpath('data') . '/plugged')
Plug 'dracula/vim'
Plug 'neoclide/coc.nvim', {'branch': 'release'}
Plug 'tpope/vim-fugitive'
Plug 'scrooloose/nerdcommenter'
Plug 'jiangmiao/auto-pairs'
Plug 'tpope/vim-endwise'
Plug 'sirtaj/vim-openscad'
Plug 'terryma/vim-multiple-cursors'
Plug 'alvan/vim-closetag'
Plug 'tpope/vim-characterize'
Plug 'lervag/vimtex'
call plug#end()
" ######################################

runtime coc_bindings.vim
inoremap <silent> <SNR>16_AutoPairsReturn =AutoPairsReturn()
