" Get the defaults that most users want.
if !has('nvim')
	source $VIMRUNTIME/defaults.vim
	if has('syntax') && has('eval')
		packadd! matchit
	endif
else
	if has('nvim-0.5')
		runtime post_lsp.vim
	else
		runtime pre_lsp.vim
	endif
endif

runtime global.vim
