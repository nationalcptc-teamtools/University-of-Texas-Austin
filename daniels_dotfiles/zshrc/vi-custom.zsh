function select-only-shell-word {
	zle select-a-shell-word -N
	if [[ "${BUFFER[$((MARK + 1))]}" == " " ]]; then
		let "MARK = MARK + 1"
	fi
}
zle -N select-only-shell-word
bindkey -M visual -r "o"
bindkey -M visual "oa" select-only-shell-word
bindkey -M viopp "oa" select-only-shell-word

function expand-selection {
	let "CURSOR = CURSOR + $1"
}

function select-n-inner-shell-word {
	zle vi-beginning-of-line
	select-only-shell-word
	repeat "${NUMERIC:-1} - 1"; do
		expand-selection 2
		MARK=$CURSOR
		select-only-shell-word
	done
}
function select-n-outer-shell-word {
	select-n-inner-shell-word
	expand-selection 1
}
zle -N select-n-inner-shell-word
zle -N select-n-outer-shell-word
bindkey -M visual 'an' select-n-outer-shell-word
bindkey -M viopp  'an' select-n-outer-shell-word
bindkey -M visual 'in' select-n-inner-shell-word
bindkey -M viopp  'in' select-n-inner-shell-word

function select-neg-inner-shell-word {
	zle vi-end-of-line
	select-only-shell-word
	repeat "${NUMERIC:-1} - 1"; do
		let "MARK = MARK - 2"
		CURSOR=$MARK
		select-only-shell-word
	done
}
function select-neg-outer-shell-word {
	select-neg-inner-shell-word
	expand-selection 1
}
zle -N select-neg-inner-shell-word
zle -N select-neg-outer-shell-word
bindkey -M visual 'aN' select-neg-outer-shell-word
bindkey -M viopp  'aN' select-neg-outer-shell-word
bindkey -M visual 'iN' select-neg-inner-shell-word
bindkey -M viopp  'iN' select-neg-inner-shell-word
