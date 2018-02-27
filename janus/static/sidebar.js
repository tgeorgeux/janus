/*
Janus: Jupyter Notebook extension that helps users keep clean notebooks by
hiding cells and tracking changes
*/

define([
    'require',
    'jquery',
    'base/js/namespace',
    'notebook/js/cell',
    'notebook/js/codecell',
    'notebook/js/textcell',
    '../janus/versions',
    '../janus/utils'
], function(
    require,
    $,
    Jupyter,
    Cell,
    CodeCell,
    TextCell,
    JanusVersions,
    JanusUtils
){

    var Sidebar = function(nb) {
        /* A sidebar panel for showing groups of hidden cells */

        var sidebar = this;
        Jupyter.sidebar = sidebar;

        sidebar.notebook = nb;
        sidebar.collapsed = true;
        sidebar.marker = null;
        sidebar.cells = []
        sidebar.sections = []

        // create html element for sidebar and add to page
        sidebar.element = $('<div id=sidebar-container>');
        $("#notebook").append(sidebar.element);

        return this;
    };


    Sidebar.prototype.toggle = function() {
        /* Toggle showing the sidebar */

        if (this.collapsed) {
            this.expand()
        } else {
            this.collapse()
        }
    }


    Sidebar.prototype.expand = function() {
        /* Show sidebar expanding from left of page */

        // only proceed if sidebar is currently collapsed
        if(! this.collapsed){
            return;
        }

        var that = this;
        this.collapsed = false;

        var site_height = $("#site").height();
        var site_width = $("#site").width();
        // 40 pixel gutter + 15 pixel padding on each side of page
        var sidebar_width = (site_width - 45) / 2;

        // move the notebook container to the side
        $("#notebook-container").animate({
            marginLeft: '15px',
            width: sidebar_width
        }, 400);


        //  move the sidebar into position
        Jupyter.sidebar.element.animate({
            right: '15px',
            width: sidebar_width,
            top: 20,
            padding: '0px'
        }, 400, function (){

            //TODO replace by iterating over sections and their cells
            // we should not have to keep a separate list of sidebar cells
            for (i=0; i<that.cells.length; i++){
                if (that.cells[i].cell_type == 'code') {
                    that.cells[i].render();
                    that.cells[i].focus_editor();
                    that.cells[i].expand_output();
                }
            }

            Jupyter.notebook.get_selected_cell().element.focus()
        })
    };


    Sidebar.prototype.collapse = function() {
        /* Collapse the sidebar to the right page border */

        // only proceed if sidebar is currently expanded
        if (this.collapsed) {
            return;
        }

        var that = this;
        this.collapsed = true;

        var menubar_width = $("#menubar-container").width();
        var site_width = $("#site").width();
        var margin = (site_width - menubar_width) / 2

        // need to use exact values for animation, then return to css defaults
        $("#notebook-container").animate({
            marginLeft: margin,
            width: menubar_width
            }, 400, function(){
                $("#notebook-container").css( 'margin-left', 'auto' )
                $("#notebook-container").css( 'width', '' )
        })

        // hide the sidebar
        this.element.animate({
            right: '15px',
            width: 0,
            padding: '0px'
        }, 400, function() {

            // hide all sections
            $('.section').hide();
            for (var i=0; i< that.sections.length; i++){
                $(that.sections[i].marker).data('showing', false);
            }
        });
    };


    Sidebar.prototype.openSection = function(cells=[], marker = null, index = 0) {
        /* open this section of cells in the sidebar

        Args:
            cells: cells from the main notebook we want to show in this section
        */

        // don't add section if it already exists
        // TODO we will want a less hacky way to do this in future, likely by making
        // the placeholders into objects with a "section" item we can check

        var new_cell_ids = []
        for (var i=0; i<cells.length; i++) {
            new_cell_ids.push(cells[i].metadata.janus.id)
        }

        // for (var j=0; j< Jupyter.sidebar.sections.length; j++) {
        //
        //     var old_cell_ids = []
        //
        //     for (var k=0; k<Jupyter.sidebar.sections[j].cells.length; k++) {
        //         old_cell_ids.push(Jupyter.sidebar.sections[j].cells[k].metadata.janus.id)
        //     }
        //
        //     if (JSON.stringify(old_cell_ids) == JSON.stringify(new_cell_ids)) {
        //         Jupyter.sidebar.sections[k].element.show();
        //         Jupyter.sidebar.sections[k].marker = marker
        //         if ($(Jupyter.sidebar.sections[k].marker).data('showing')){
        //             Jupyter.sidebar.expand();
        //         }
        //         return
        //     }
        // }


        // $(marker).data('showing', true);

        // add section to sidebar and render cells in it
        var sb = Jupyter.sidebar;
        var newSection = createSection(marker)
        var title = ""
        var title_labels = $(marker).find('.hide-label')
        if (title_labels.length > 0){
            var title = title_labels[0].innerHTML
        }

        $(marker).data('sectionIndex', index)

        //TODO later we will want to append in the right spot on the list
        $(sb.element).append(newSection.element);
        newSection.renderCells(cells, title)

        // TODO later we will want to insert it at the correct spot in the list
        sb.sections.push(newSection)

        // open sidebar if needed
        if ( $(marker).data('showing') ) {
            newSection.element.show()
            sb.expand()
        } else {
            newSection.element.hide()
        }

        Jupyter.sidebar.saveMarkerMetadata()


    }


    Sidebar.prototype.showWithCells = function (cell_ids, marker = null, index = 0) {
        /* get cells to show in sidebar if given their Janus ids

        Args:
            cell_ids: ids of the cells to show
            marker: the placeholder we are rendering in place of
        */

        var cells = Jupyter.notebook.get_cells()
        var cells_to_copy = []
        for (var i = 0; i < cells.length; i++) {
            if ( $.inArray( cells[i].metadata.janus.id, cell_ids ) > -1 ){
                cells_to_copy.push(cells[i])
            }
        }
        Jupyter.sidebar.openSection(cells_to_copy, marker, index)
    }


    var Section = function( marker = null ) {
        /* A group of contiguous cells to be shown in the sidebar */

        var section = this;

        //TODO pass marker to constructor to link this and the marker
        section.cells = []
        section.marker = marker;

        section.element = $('<div class=section>');
        $("#notebook").append(section.element);

        return this;
    }


    Section.prototype.renderCells = function(cells, title = "") {
        /* render notebook cells in the section

        Args:
            cells: list of cell objects from the main notebook
        */

        var that = this;

        // remove any cells currently in section
        this.cells = []

        // add header
        var header = $("<div/>").addClass('section-header')
        var closeContainer = $("<div/>").addClass('section-close')
            .append($("<i>")
            .addClass("fa fa-angle-left section-close-button")
            .click( function(){
                that.close();
            })
        )
        header.append(closeContainer)
        header.append($("<div/>").addClass('section-title').text(title))
        this.element.append(header)

        // add cell wrapper
        $(this.element).find('.section-cell-wrapper').remove();
        var cellWrapper = $("<div/>")
            .addClass('section-cell-wrapper')
            .addClass('cell-wrapper')
        this.element.append(cellWrapper);

        // for each cell, create a new cell in the Sidebar with the same content
        for (var i = 0; i < cells.length; i++) {

            // add new cell to the sidebar
            newCell = this.createSectionCell(cells[i]);
            cellWrapper.append(newCell.element);
            this.cells.push(newCell);

            // for now, add sell to sidebar list too
            Jupyter.sidebar.cells.push(newCell);


            // make sure all code cells are rendered
            if (newCell.cell_type == 'code') {
                newCell.render();
                newCell.focus_editor();
                newCell.expand_output();
            }

            // hide output if needed
            if (newCell.metadata.janus.source_hidden && ! newCell.metadata.janus.output_hidden) {
                newCell.element.find("div.output_wrapper").hide();
            }

            if (newCell.metadata.janus.output_hidden && !newCell.metadata.janus.source_hidden) {
                newCell.element.find("div.input").hide();
            }

            // intercept sidebar click events and apply them to original cell
            newCell._on_click = function(event) {

                // select the appropriate cell in the original notebook
                this.events.trigger('select.Cell', {
                    'cell': this.nb_cell,
                    'extendSelection':event.shiftKey
                });
            }

            // propigate edits in sidebar cell to main notebook cell
            newCell.code_mirror.on('change', function(){
                if(newCell.nb_cell){
                    newCell.nb_cell.set_text( newCell.get_text() )
                }
            });

            // render any history markers
            JanusVersions.renderMarkers(newCell);
        }

        // focus the first cell in the sidebar
        if(cells.length > 0){
            cells[0].sb_cell.element.focus();
            if(cells[0].cell_type == 'code'){
                cells[0].sb_cell.focus_editor();
            }
        }

        var selCell = Jupyter.notebook.get_selected_cell()
        selCell.element.focus()
        selCell.focus_cell()
        if(selCell.cell_type == 'code'){
            selCell.focus_editor();
        }

    }


    Section.prototype.createSectionCell = function(cell) {
        /* Create sidebar cell duplicating a cell in the main notebook

        Args:
            cell: a single cell object from the main notebook
        */

        var cellJSON = cell.toJSON();
        var newCell = JanusUtils.getDuplicateCell(cellJSON, Jupyter.notebook)

        // link the notebook and sidebar cells
        newCell.nb_cell = cell;
        cell.sb_cell = newCell;

        return newCell;
    }


    Section.prototype.close = function() {
        /* Delete a section from the sidebar */

        // hide this element
        this.element.hide()
        $(this.marker).data('showing', false);

        Jupyter.sidebar.saveMarkerMetadata()

        // collapse sidebar if this was the last visible section
        var allClosed = true;

        for (var i = 0; i < Jupyter.sidebar.sections.length; i++) {
            if ($(Jupyter.sidebar.sections[i].marker).data('showing') == true) {
                allClosed = false;
            }
        }
        if (allClosed) {
            Jupyter.sidebar.collapse()
        }

        Jupyter.sidebar.repositionSections()

    }


    Sidebar.prototype.updateHiddenCells = function (){
        /* Update cells in the notebook and the sidebar */

        this.updateHiddenCellsNotebook()
        this.updateHiddenCellsSidebar()
        // position cells correctly
    }


    Sidebar.prototype.updateHiddenCellsNotebook = function() {

        // get the current configuration of the cells
        // save data from and remove current markers for hidden cells
        $(".hide-container").remove()

        var cells = Jupyter.notebook.get_cells();
        var serial_hidden_cells = []
        var serial_lines = 0

        for (var i = 0; i < cells.length; i++) {

            // keep track of groups of hidden cells
            var cellHidden = cells[i].metadata.janus.cell_hidden
            if (cellHidden) {
                serial_hidden_cells.push(cells[i])

                // count lines of code
                if (cells[i].cell_type == "code") {
                    var lines_of_code = cells[i].get_text().split('\n').length
                    if (lines_of_code > 0) {
                        serial_lines = serial_lines + lines_of_code
                    }
                }
            }

            // create placeholder if at last cell, or at visible cell after
            // a group of hidden cells
            var numHidden = serial_hidden_cells.length
            if ( i == cells.length - 1 && cellHidden || (! cellHidden && numHidden > 0) ){

                var cell_ids = []
                for (var j = 0; j < numHidden; j++) {
                    serial_hidden_cells[j].element.addClass('hidden');
                    cell_ids.push(serial_hidden_cells[j].metadata.janus.id);
                }

                // create placeholder that will render this group of hidden cells
                Jupyter.sidebar.addPlaceholderAfterElementWithIds(serial_hidden_cells[numHidden - 1].element, cell_ids, serial_lines)

                // clear our lists
                serial_hidden_cells = []
                serial_lines = 0
            }
        }

        //TODO may not need this here
        Jupyter.sidebar.saveMarkerMetadata()

    }


    Sidebar.prototype.updateHiddenCellsSidebar = function() {

        // remove all items from the sidebar
        $('.section').remove();
        Jupyter.sidebar.sections = []

        var markers = $('.hide-marker, .hidden-output, .hidden-code').toArray()

        for (var i = 0; i < markers.length; i++) {
            Jupyter.sidebar.showWithCells( $(markers[i]).data('ids'), markers[i], i )
        }
        Jupyter.notebook.get_selected_cell().focus_cell()

        Jupyter.sidebar.repositionSections(true)
    }


    Sidebar.prototype.repositionSections = function (initialPos = false){
        /* Reposition the sidebar sections based on what is currently selected */

        // don't reposition is main notebook cell is selected
        // var selCell = Jupyter.notebook.get_selected_cell()
        // var selCellHidden = selCell.metadata.janus.cell_hidden
        // var selOutHidden = selCell.metadata.janus.output_hidden
        // var selSourceHidden = selCell.metadata.janus.source_hidden
        //
        // if (! (selCellHidden || selOutHidden || selSourceHidden) && ! initialPos) {
        //     return
        // }
        //
        // var marker = null;
        // if (selCellHidden) {
        //     var marker = $(selCell.element).next('.hide-marker')
        // } else if (selOutHidden) {
        //     var marker = $(selCell.element).find('.hidden-output').first()
        // } else if (selSourceHidden) {
        //     var marker = $(selCell.element).find('.hidden-code').first()
        // }

        // if (marker) {
        //
        //     // don't reposition if select item not showing
        //     var secIndex = marker.data('sectionIndex');
        //     var selSect = Jupyter.sidebar.sections[secIndex]
        //     var selSectShow = $(selSect.marker).data('showing')
        //
        //     var selSectYPos = getYPos(selSect.marker)
        //     console.log(selSectYPos)
        //     $(selSect).css({ top: selSectYPos});
        //
        // } else {

        var prevEnd = null;
        for (var i = 0; i < Jupyter.sidebar.sections.length; i++) {
            var sect = Jupyter.sidebar.sections[i].element
            var marker = Jupyter.sidebar.sections[i].marker
            var showing = $(marker).data('showing')
            if (! showing) {
                continue
            }
            var yPos = getYPos(marker)
            if (prevEnd){
                yPos = Math.max(prevEnd, yPos)
            }
            $(sect).animate({ top: yPos}, 400);
            prevEnd = $(sect).offset().top + $(sect).outerHeight();
        }

        // }
    }


    function getYPos(marker) {
        /* Get the y position of a marker relative to the notebook  */

        if ($(marker).hasClass('hide-marker')) {
            return $(marker).closest('.hide-container').position().top - 24
        } else if ($(marker).hasClass('hidden-code')) {
            return $(marker).closest('.cell').position().top - 24
        } else if ($(marker).hasClass('hidden-output')) {
            return $(marker).closest('.cell').position().top - 24
        } else {
            return 0
        }
    }


// PLACEHOLDERS FOR HIDDEN CELLS
    Sidebar.prototype.addPlaceholderAfterElementWithIds = function(elem, cell_ids, serial_lines) {
        /* Add the placeholder used to open a group of hidden cells */

        // get placholder name and showing status from metadata, if present
        var markerMetadata = Jupyter.notebook.metadata.janus.janus_markers;
        var first_stored = '';
        var first_showing = false
        if (markerMetadata) {
            for (var j = 0; j < markerMetadata.length; j++) {
                overlap = markerMetadata[j].ids.filter((n) => cell_ids.includes(n))
                if(overlap.length > 0){
                    var first_stored = markerMetadata[j].markerName
                    var first_showing = markerMetadata[j].showing
                    break
                }
            }
        }

        var place = elem.after($('<div>')
            .addClass('hide-container')
            .append($('<div>')
                .addClass('hide-spacer'))
            .append($('<div>')
                .addClass('hide-marker')
                .data('ids', cell_ids.slice())
                .data('showing', first_showing)
                .click(function(){
                    $('#minimap').remove()
                    var that = this;
                    Jupyter.sidebar.marker = that;
                    $(this).data('showing', true);
                    var secIndex = $(this).data('sectionIndex');
                    Jupyter.sidebar.sections[secIndex].element.show();
                    Jupyter.sidebar.repositionSections()
                    Jupyter.sidebar.expand()
                    Jupyter.sidebar.saveMarkerMetadata()
                })
                .hover(function(event){
                    JanusUtils.showMinimap(event, this)
                },
                function(event){
                    JanusUtils.hideMinimap(event, this)
                })
                .mousemove( function(event){
                    JanusUtils.moveMinimap(event, this);
                }
                )
                .append($('<div>')
                    .addClass('hide-label')
                    .click(function(event){
                        enableVersionNameEditing(this)
                        event.stopPropagation()
                    })
                    .focusout(function(){
                        disableVersionNameEditing(this)
                    })
                    .hover(function(event){
                        this.style.color = "#333"
                        this.style.background = "#DDD"
                    },
                    function(event){
                        this.style.color = ""
                        this.style.background = ""
                    })
                    .text(function(){
                        if(first_stored == "" || first_stored == "Hidden Cells"){
                            return "Hidden Cells"
                        }
                        else{
                            return first_stored
                        }
                    })
                    // TODO intercept "Enter" to unselect, rather than start new line
                )
                .append($('<div>')
                    .addClass('hide-text')
                    .text(serial_lines +  " lines")
                    .append($('<div>')
                        .addClass('fa fa-angle-right hide-arrow')))
                )
            )
    }


    Sidebar.prototype.saveMarkerMetadata = function() {
        /* Store marker names to notebook metadata for later use */

        var hideMarkers = $('.hide-marker').toArray()
        var hideMetadata = []
        for (i = 0; i < hideMarkers.length; i++) {
            var markerIDs = $(hideMarkers[i]).data('ids')
            var markerName = $(hideMarkers[i]).find('.hide-label')[0].innerHTML
            var showing = $(hideMarkers[i]).data('showing')
            hideMetadata.push({
                'ids': markerIDs,
                'markerName': markerName,
                'showing': showing
            })
        }
        Jupyter.notebook.metadata.janus.janus_markers = hideMetadata
    }


    function highlightMarker(marker) {
        /*  highlight the marker clicked to show the sidebar
        marker: dom element, or null */

        $('.hide-marker').removeClass('active')
        $('.hidden-code').removeClass('active')
        $('.hidden-output').removeClass('active')
        if(marker != null){
            $(marker).addClass('active')
        }
    }


    function enableVersionNameEditing(element) {
        /* let version marker div be edited to name version

        Args:
            element: placeholder element to enable naming on
        */

        element.contentEditable = true;
        element.focus()
        Jupyter.notebook.keyboard_manager.edit_mode();
    }


    function disableVersionNameEditing(element) {
        /* stop editing version name and save to metadata

        Args:
            element: placeholder to get name from
        */

        element.contentEditable = false;
        Jupyter.notebook.keyboard_manager.command_mode();
        if(element.innerHTML == "" || element.innerHTML == "Hidden Cells"){
            element.innerHTML = "Hidden Cells"
        }
        Jupyter.sidebar.saveMarkerMetadata()

    }


    function createSidebar() {
        /* create a new sidebar element */

        return new Sidebar(Jupyter.notebook);
    }


    function createSection(marker = null) {

        return new Section(marker);
    }


    return{
        createSidebar: createSidebar
    };

});
