SJS := ./node_modules/.bin/sjs -m sparkler/macros -m rustyscript/macros
REGENERATOR := ./node_modules/.bin/regenerator

all: index.sjs
	@$(SJS) -o index.js_ index.sjs
	@$(REGENERATOR) index.js_ > index.js
	@rm index.js_
	@echo "index.sjs > index.js"
