/*
Janus: Jupyter Notebook extension that helps users keep clean notebooks by
folding cells and keeping track of all changes
*/

define([
    'require',
    'jquery',
    'base/js/namespace',
    'notebook/js/cell',
    'notebook/js/codecell',
    'notebook/js/textcell',
    '../janus/janus_history'
], function(
    require,
    $,
    Jupyter,
    Cell,
    CodeCell,
    TextCell,
    JanusHistory
){


    var Sidebar = function(nb){
        /* A sidebar panel for showing indented cells */
        var sidebar = this;
        Jupyter.sidebar = sidebar;

        sidebar.notebook = nb;
        sidebar.collapsed = true;
        sidebar.cells = [];
        sidebar.marker = null;
        sidebar.markerPosition = 0;

        // create html element for sidebar and add to page
        sidebar.element = $('<div id=sidebar-container>');
        $("#notebook").append(sidebar.element);

        return this;
    };

    Sidebar.prototype.renderCells = function(cells){
        /* render notebook cells in the sidebar
        cells: list of cell objects from the main notebook */

        // remove any cells currently in sidebar
        this.cells = []
        $('#sidebar-cell-wrapper').remove();
        this.element.append($("<div/>")
            .attr('id', 'sidebar-cell-wrapper')
            .addClass('cell-wrapper'));

        // for each cell, create a new cell in the Sidebar with the same content
        for (i = 0; i < cells.length; i++){

            // add new cell to the sidebar
            newCell = this.createSidebarCell(cells[i]);
            $('#sidebar-cell-wrapper').append(newCell.element);
            this.cells.push(newCell);

            // make sure all code cells are rendered
            if(newCell.cell_type == 'code'){
                newCell.render();
                newCell.focus_editor();
            }

            // hide output if needed
            if(newCell.metadata.janus.source_hidden){
                newCell.element.find("div.output_wrapper").hide();
            }

            // intercept sidebar click events and apply them to original cell
            newCell._on_click = function(event){
                // unselect all cells in sidebar
                sb_cells = Jupyter.sidebar.cells
                for(j=0; j < sb_cells.length; j++){
                    sb_cells[j].selected = false;
                    sb_cells[j].element.removeClass('selected');
                    sb_cells[j].element.addClass('unselected');
                }

                // select this cell in the sidebar
                this.selected = true;
                this.element.removeClass('unselected');
                this.element.addClass('selected');

                // select the appropriate cell in the original notebook
                this.events.trigger('select.Cell', {
                    'cell':this.nb_cell,
                    'extendSelection':event.shiftKey
                });
            }

            // propigate edits in sidebar cell to main notebook cell
            newCell.code_mirror.on('change', function(){
                newCell.nb_cell.set_text(newCell.get_text())
            });

            // render any history markers
            JanusHistory.render_markers(newCell);
        }

        // focus the first cell in the sidebar
        if(cells.length > 0){
            cells[0].sb_cell.element.focus();
            if(cells[0].cell_type == 'code'){
                cells[0].sb_cell.focus_editor();
            }
        }
    }

    Sidebar.prototype.createSidebarCell = function(cell){
        /* Create sidebar cell duplicating a cell in the main notebook
        cell: a single cell object from the main notebook */

        newCell = null

        // markdown cells
        if(cell.cell_type == 'markdown'){
            newCell = new TextCell.MarkdownCell({
                events: this.notebook.events,
                config: this.notebook.config,
                keyboard_manager: this.notebook.keyboard_manager,
                notebook: this.notebook,
                tooltip: this.notebook.tooltip,
            });
        }
        // code cells
        else if(cell.cell_type == 'code'){
            newCell = new CodeCell.CodeCell(this.notebook.kernel, {
                events: this.notebook.events,
                config: this.notebook.config,
                keyboard_manager: this.notebook.keyboard_manager,
                notebook: this.notebook,
                tooltip: this.notebook.tooltip,
            });
        }
        else if (cell.cell_type = 'raw'){
            newCell = new TextCell.RawCell({
                events: this.notebook.events,
                config: this.notebook.config,
                keyboard_manager: this.notebook.keyboard_manager,
                notebook: this.notebook,
                tooltip: this.notebook.tooltip,
            });
        }

        // populate sidebar cell with content of notebook cell
        cell_data = cell.toJSON();
        newCell.fromJSON(cell_data);

        // link the notebook and sidebar cells
        newCell.nb_cell = cell;
        cell.sb_cell = newCell;

        return newCell;
    }

    Sidebar.prototype.toggle = function(cells = []){
        /* expand or collapse sidebar
        cells: list of cell objects from the main notebook */

        // get ids for cells to render, and cells already in sidebar
        new_cell_ids = []
        old_cell_ids = []
        for(i=0; i<cells.length; i++){
            new_cell_ids.push(cells[i].metadata.janus.cell_id)
        }
        for(j=0; j<this.cells.length; j++){
            old_cell_ids.push(this.cells[j].metadata.janus.cell_id)
        }

        // expand sidebar if collapsed
        if(this.collapsed){
            this.expand()
            nb_cells = Jupyter.notebook.get_cells()
            for(i=0; i < nb_cells.length; i++){
                if(cells[0].metadata.janus.cell_id == nb_cells[i].metadata.janus.cell_id){
                    Jupyter.notebook.select(i);
                    Jupyter.notebook.scroll_to_cell(i, 500)
                }
            }
            if(cells.length > 0){
                this.renderCells(cells)
            }
            highlightMarker(this.marker);
        }
        // update sidebar if new cells, or new cell border
        // this comparison method seems hacky
        else if(JSON.stringify(old_cell_ids) != JSON.stringify(new_cell_ids)){
            highlightMarker(this.marker)
            nb_cells = Jupyter.notebook.get_cells()
            for(i=0; i < nb_cells.length; i++){
                if(cells[0].metadata.janus.cell_id == nb_cells[i].metadata.janus.cell_id){
                    Jupyter.notebook.select(i);
                    //Jupyter.notebook.scroll_to_cell(i, 500)
                }
            }
            // may want to created a "thinking" animation for when loading large numbers of cells
            var markerPosition = $(Jupyter.sidebar.marker).parent().position().top - 12
            if($(Jupyter.sidebar.marker).hasClass('hidden-code')){
                markerPosition = $(cells[0].element).position().top;
            }
            this.element.animate({
                top: markerPosition,
            }, 0)
            if(cells.length > 0){
                Jupyter.sidebar.renderCells(cells);
                Jupyter.sidebar.cells[0].focus_editor();
            }

        }
        // otherwise collapse sidebar
        else{
            this.collapse()
            highlightMarker(null)
        }
    }

    Sidebar.prototype.expand = function(){
        /* Show sidebar expanding from left of page */

        // only proceed if sidebar is collapsed
        if(! this.collapsed){
            return;
        }

        this.collapsed = false;
        var site_height = $("#site").height();
        var site_width = $("#site").width();
        var sidebar_width = (site_width - 70) / 2; // 40 pixel gutter + 15 pixel padding on each side of page

        $('#sidebar-cell-wrapper').show()

        $("#notebook-container").animate({
            marginLeft: '15px',
            width: sidebar_width
        }, 400, function(){
            var markerPosition = $(Jupyter.sidebar.marker).parent().position().top - 12
            if($(Jupyter.sidebar.marker).hasClass('hidden-code')){
                markerPosition = $(Jupyter.sidebar.cells[0].nb_cell.element).position().top;
            }
            Jupyter.sidebar.element.animate({
                right: '15px',
                width: sidebar_width,
                top: markerPosition,
                padding: '0px'
            }, 400, function(){ // ensure code cells are fully rendered
                sb_cells = Jupyter.sidebar.cells
                for(i = 0; i < sb_cells.length; i++){
                    if(sb_cells[i].cell_type == 'code'){
                        sb_cells[i].render();
                        sb_cells[i].focus_editor();
                    }
                }
                sb_cells[0].focus_editor();
                nb_cells = Jupyter.notebook.get_cells()
                for(i=0; i < nb_cells.length; i++){
                    if(sb_cells[0].metadata.janus.cell_id == nb_cells[i].metadata.janus.cell_id){
                        Jupyter.notebook.scroll_to_cell(i, 500)
                    }
                }
            })
        });
    };

    Sidebar.prototype.collapse = function(){
        /* Collapse the sidebar to the right page border */

        // only proceed if sidebar is expanded
        if(this.collapsed){
            return;
        }

        this.collapsed = true;
        var menubar_width = $("#menubar-container").width();
        var site_width = $("#site").width();
        var margin = (site_width - menubar_width) / 2

        // need to use exact values for animation, then return to defaults
        $("#notebook-container").animate({
            marginLeft: margin,
            width: menubar_width
            }, 400, function(){
                $("#notebook-container").css( 'margin-left', 'auto' )
                $("#notebook-container").css( 'width', '' )
        })

        this.element.animate({
            right: '15px',
            width: 0,
            padding: '0px'
        }, 400, function(){
                $('#sidebar-cell-wrapper').hide(); // only hide after animation finishes
        });
    };

    Sidebar.prototype.update = function(){
        /* update the cells rendered in the sidebar, such as after deletion */

        if(!this.collapsed){
            // get list of previous cells in sidebar and currently hidden cells
            nb_cells = Jupyter.notebook.get_cells()
            old_cell_ids = []
            hidden_cell_ids = []

            for(j=0; j<this.cells.length; j++){
                old_cell_ids.push(this.cells[j].metadata.janus.cell_id)
            }
            for(i=0; i<nb_cells.length; i++){
                if(nb_cells[i].metadata.janus.cell_hidden){
                    hidden_cell_ids.push(nb_cells[i].metadata.janus.cell_id)
                }
            }

            // find the first hidden cell that was in our previous sidebar
            var first_hidden = null
            for(k=0; k<hidden_cell_ids.length; k++){
                if(old_cell_ids.indexOf(hidden_cell_ids[k]) >= 0 ){
                    first_hidden = hidden_cell_ids[k]
                    break
                }
            }

            // if none found, then collapse the sidebar
            if(first_hidden == null){
                this.collapse()
            }
            // else update the sidebar
            else{
                // get placeholder with the top previous hidden cell in it
                placeholders = $('.indent-marker').toArray()
                for(i=0; i<placeholders.length; i++){
                    if($(placeholders[i]).data('ids').indexOf(first_hidden) >= 0){
                        Jupyter.sidebar.marker = placeholders[i];
                        Jupyter.sidebar.markerPosition = $(placeholders[i]).parent().position().top
                        Jupyter.sidebar.showWithCells($(placeholders[i]).data('ids'))
                        break
                    }
                }
            }
        }
    }

    Sidebar.prototype.hideIndentedCells = function(){
        /* hide all indented cells and render placeholders in their place */

        // save data from and remove current markers for hidden cells
        // saveMarkerMetadata();
        $(".indent-container").remove()

        cells = Jupyter.notebook.get_cells();
        serial_hidden_cells = []
        serial_lines = 0

        for(i = 0; i < cells.length; i++){
            // make sure all cells have the right metadata
            if (cells[i].metadata.janus.cell_hidden === undefined){
                cells[i].metadata.janus.cell_hidden = false;
            }
            // make sure all cells have a unique Janus id
            if (cells[i].metadata.janus.cell_id === undefined){
                cells[i].metadata.janus.cell_id = Math.random().toString(16).substring(2);
            }

            // keep track of groups of hidden cells
            if(cells[i].metadata.janus.cell_hidden){
                serial_hidden_cells.push(cells[i])
                if(cells[i].cell_type == "code"){
                    lines_of_code = cells[i].get_text().split('\n').length
                    if(lines_of_code > 0){
                        serial_lines = serial_lines + lines_of_code
                    }
                }

                if(i == cells.length - 1){
                    cell_ids = []
                    for(j = 0; j < serial_hidden_cells.length; j++){
                        serial_hidden_cells[j].element.addClass('hidden');
                        cell_ids.push(serial_hidden_cells[j].metadata.janus.cell_id);
                    }
                    // create placeholder that will render this group of hidden cells
                    Jupyter.sidebar.addPlaceholderAfterElementWithIds(serial_hidden_cells[serial_hidden_cells.length - 1].element, cell_ids, serial_lines)

                    serial_hidden_cells = []
                    serial_lines = 0
                }
            }
            else{
                // if this cell is visible but preceeded by a hidden cell
                if(serial_hidden_cells.length > 0){
                    // hide the previously cells and get a list of their ids
                    cell_ids = []
                    for(j = 0; j < serial_hidden_cells.length; j++){
                        serial_hidden_cells[j].element.addClass('hidden');
                        cell_ids.push(serial_hidden_cells[j].metadata.janus.cell_id);
                    }
                    // create placeholder that will render this group of hidden cells
                    Jupyter.sidebar.addPlaceholderAfterElementWithIds(serial_hidden_cells[serial_hidden_cells.length - 1].element, cell_ids, serial_lines)

                    serial_hidden_cells = []
                    serial_lines = 0
                }
            }
        }
    }

    Sidebar.prototype.showWithCells = function (cell_ids){
        /* get cells to show in sidebar if given their Janus ids */
        cells = Jupyter.notebook.get_cells()
        cells_to_copy = []
        for(i=0; i<cells.length; i++){
            if ( $.inArray( cells[i].metadata.janus.cell_id, cell_ids ) > -1 ){
                cells_to_copy.push(cells[i])
            }
        }
        Jupyter.sidebar.toggle(cells_to_copy)
    }

    function highlightMarker(marker){
        /*  highlight the marker clicked to show the sidebar
        marker: dom element, or null */

        $('.indent-marker').removeClass('active')
        $('.hidden-code').removeClass('active')
        if(marker != null){
            $(marker).addClass('active')
        }
    }

    Sidebar.prototype.addPlaceholderAfterElementWithIds = function(elem, cell_ids, serial_lines){
        /* Add the placeholder used to open a group of indented cells */

        // get placholder name from metadata, if present
        var markerMetadata = Jupyter.notebook.metadata.janus_markers;
        var first_stored = '';
        if(markerMetadata){
            for(j = 0; j < markerMetadata.length; j++){
                overlap = markerMetadata[j].ids.filter((n) => cell_ids.includes(n))
                if(overlap.length > 0){
                    first_stored = markerMetadata[j].markerName
                    break
                }
            }
        }

        var place = elem.after($('<div>')
            .addClass('indent-container')
            .append($('<div>')
                .addClass('indent-spacer'))
            .append($('<div>')
                .addClass('indent-marker')
                .data('ids', cell_ids.slice())
                .click(function(){
                    $('#minimap').remove()
                    that = this;
                    Jupyter.sidebar.marker = that;
                    Jupyter.sidebar.markerPosition = $(that).parent().position().top;
                    Jupyter.sidebar.showWithCells($(this).data('ids'))
                })
                .hover(function(event){
                    showMinimap(event, this)
                },
                function(event){
                    hideMinimap(event, this)
                })
                // .hover(showMinimap, hideMinimap)
                .append($('<div>')
                    .addClass('indent-label')
                    .click(function(event){
                        enableVersionNameEditing(this)
                        event.stopPropagation()
                    })
                    .focusout(function(){
                        disableVersionNameEditing(this)
                    })
                    .text(function(){
                        if(first_stored == "" || first_stored == "Folded Cells"){
                            return "Folded Cells"
                        }
                        else{
                            return first_stored
                        }
                    })
                    // .css('color', function(){
                    //     if(first_stored == "" || first_stored == "Hidden Cells"){
                    //         return "#aaaaaa"
                    //     }
                    //     else{
                    //         return ""
                    //     }
                    // })
                    // TODO intercept "Enter" to unselect, rather than start new line
                )
                .append($('<div>')
                        .addClass('indent-text')
                        .text(serial_lines +  " lines")))
            )
    }

    function high(event, el){
        el.style.backgroundColor = "#f5f5f5"
    }

    function low(event, el){
        el.style.backgroundColor = ""
    }

    function showMinimap(event, el){
        /* render rich tooltip with miniturized view of hidden cells */
        var el_top = $(el).parent().position().top;
        var el_right = $(el).parent().position().left + $(el).parent().width();
        var cell_ids = $(el).data('ids');

        // if this already shown in sidebar, don't show again
        if(!Jupyter.sidebar.collapsed){
            sidebar_cells = Jupyter.sidebar.cells
            sidebar_cell_ids = []

            for(i=0; i<sidebar_cells.length; i++){
                sidebar_cell_ids.push(sidebar_cells[i].metadata.janus.cell_id)
            }

            if(JSON.stringify(sidebar_cell_ids) == JSON.stringify(cell_ids)){
                return
            }
        }

        el.style.backgroundColor = "#f5f5f5"

        cells = Jupyter.notebook.get_cells()
        cells_to_copy = []
        for(i=0; i<cells.length; i++){
            if ( $.inArray( cells[i].metadata.janus.cell_id, cell_ids ) > -1 ){
                cells_to_copy.push(cells[i])
            }
        }

        var minimap = $('<div id=minimap>');
        minimap.css({
            'top': el_top,
            'left': el_right + 25
        })
        $("#notebook").append(minimap);
        var mini_wrap = $('<div>').addClass('mini-wrap')
        minimap.append(mini_wrap)


        // populate it with our cells
        // for each cell, create a new cell in the Sidebar with the same content
        for (i = 0; i < cells_to_copy.length; i++){

            // add new cell to the sidebar
            cell = cells_to_copy[i]
            newCell = null
            nb = Jupyter.notebook

            // markdown cells
            if(cell.cell_type == 'markdown'){
                newCell = new TextCell.MarkdownCell({
                    events: nb.events,
                    config: nb.config,
                    keyboard_manager: nb.keyboard_manager,
                    notebook: nb,
                    tooltip: nb.tooltip,
                });
            }
            // code cells
            else if(cell.cell_type == 'code'){
                newCell = new CodeCell.CodeCell(nb.kernel, {
                    events: nb.events,
                    config: nb.config,
                    keyboard_manager: nb.keyboard_manager,
                    notebook: nb,
                    tooltip: nb.tooltip,
                });
            }
            else if (cell.cell_type = 'raw'){
                newCell = new TextCell.RawCell({
                    events: nb.events,
                    config: nb.config,
                    keyboard_manager: nb.keyboard_manager,
                    notebook: nb,
                    tooltip: nb.tooltip,
                });
            }

            // populate sidebar cell with content of notebook cell
            cell_data = cell.toJSON();
            newCell.fromJSON(cell_data);

            // newCell = Jupyter.sidebar.createSidebarCell(cells[i]);
            $('.mini-wrap').append(newCell.element);

            // make sure all code cells are rendered
            // TODO find another way to do this without it focusing the cell
            if(newCell.cell_type == 'code'){
                newCell.render();
                newCell.refresh();
            }

            // hide output if needed
            if(newCell.metadata.janus.source_hidden){
                newCell.element.find("div.output_wrapper").hide();
            }
        }

        // reset div height
        cells_height = $(mini_wrap).height()
        minimap.height(cells_height * 0.33)
    }

    function hideMinimap(event, el){
        // remove any mini-map divs
        $('#minimap').remove()
        el.style.backgroundColor = ""
    }

    function enableVersionNameEditing(element){
        /* let version marker div be edited to name version */
        element.contentEditable = true;
        element.focus()
        Jupyter.notebook.keyboard_manager.edit_mode();
    }

    function disableVersionNameEditing(element){
        /* stop editing version name and save to metadata */
        element.contentEditable = false;
        Jupyter.notebook.keyboard_manager.command_mode();

        if(element.innerHTML == "" || element.innerHTML == "Folded Cells"){
            // element.style.color = "#aaaaaa"
            element.innerHTML = "Folded Cells"
            // element.parentElement.style.border = "1px solid #ccc"
        }
        else{
            // element.style.color = ""
            // element.parentElement.style.border = "0px solid #0000FF"
        }

        saveMarkerMetadata()

    }

    function saveMarkerMetadata(){
        /* Store marker names to notebook metadata for later use */
        indentMarkers = $('.indent-marker').toArray()
        indentMetadata = []
        for(i=0; i < indentMarkers.length; i++){
            markerIDs = $(indentMarkers[i]).data('ids')
            markerName = $(indentMarkers[i]).find('.indent-label')[0].innerHTML
            indentMetadata.push({
                'ids': markerIDs,
                'markerName': markerName
            })
        }
        Jupyter.notebook.metadata.janus_markers = indentMetadata
    }

    function createSidebar() {
        /* create a new sidebar element */
        return new Sidebar(Jupyter.notebook);
    }

    return{
        createSidebar: createSidebar,
        saveMarkerMetadata: saveMarkerMetadata
    };
});
