"use client";

import { useT } from "./I18nProvider";
import { uiText } from "@/lib/i18n/ui";
import { useState, useCallback } from "react";
import { Selection, type Command } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  isInTable, findTable, CellSelection, TableMap,
  addColumnAfter, addColumnBefore,
  addRowAfter, addRowBefore,
  deleteColumn, deleteRow, deleteTable,
  mergeCells, splitCell,
  toggleHeaderRow, toggleHeaderColumn,
} from "prosemirror-tables";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface TableContextMenuProps {
  viewRef: React.MutableRefObject<EditorView | null>;
  children: React.ReactNode;
  onProperties: () => void;
}

export default function TableContextMenu({ viewRef, children, onProperties }: TableContextMenuProps) {
  const t = useT();
  const [inTable, setInTable] = useState(false);

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    const v = viewRef.current;
    const cell = event.target instanceof Element ? event.target.closest("td,th") : null;
    if (!v || !cell || !v.dom.contains(cell)) {
      // Stop Radix's trigger without cancelling the browser's native menu.
      event.stopPropagation(); setInTable(false); return;
    }
    try {
      if (!(v.state.selection instanceof CellSelection && cell.classList.contains("selectedCell"))) {
        const position = v.posAtDOM(cell,0);
        v.dispatch(v.state.tr.setSelection(Selection.near(v.state.doc.resolve(position))));
      }
      setInTable(isInTable(v.state));
    } catch { event.stopPropagation(); setInTable(false); }
  }, [viewRef]);

  const run = (cmd: Command) => {
    const v = viewRef.current;
    if (!v) return;
    cmd(v.state, v.dispatch);
    v.focus();
  };

  const selectWholeTable = () => {
    const v = viewRef.current;
    if (!v) return;
    const table = findTable(v.state.selection.$from);
    if (!table) return;
    const map = TableMap.get(table.node);
    const { tr, doc } = v.state;
    const anchorCell = table.start + map.map[0];
    const headCell = table.start + map.map[map.map.length - 1];
    const sel = CellSelection.create(doc, anchorCell, headCell);
    v.dispatch(tr.setSelection(sel));
    v.focus();
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="contents" onContextMenuCapture={handleContextMenu}>{children}</div>
      </ContextMenuTrigger>

      {inTable && <ContextMenuContent className="w-52">
          <>
            <ContextMenuItem onSelect={onProperties}>{t.tableProperties.title}</ContextMenuItem>
            <ContextMenuSeparator />
            {/* Sütun işlemleri */}
            <ContextMenuSub>
              <ContextMenuSubTrigger>{uiText(t, "Column")}</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem onSelect={() => run(addColumnBefore)}>
                  {t.tableMenu.columnLeft}
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => run(addColumnAfter)}>
                  {t.tableMenu.columnRight}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onSelect={() => run(deleteColumn)}
                  className="text-destructive focus:text-destructive"
                >
                  {t.tableMenu.deleteColumn}
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>

            {/* Satır işlemleri */}
            <ContextMenuSub>
              <ContextMenuSubTrigger>{uiText(t, "Row")}</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem onSelect={() => run(addRowBefore)}>
                  {t.tableMenu.rowAbove}
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => run(addRowAfter)}>
                  {t.tableMenu.rowBelow}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onSelect={() => run(deleteRow)}
                  className="text-destructive focus:text-destructive"
                >
                  {t.tableMenu.deleteRow}
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>

            {/* Hücre işlemleri */}
            <ContextMenuSub>
              <ContextMenuSubTrigger>{uiText(t, "Cell")}</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem onSelect={() => run(mergeCells)}>
                  {t.tableMenu.mergeCells}
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => run(splitCell)}>
                  {t.tableMenu.splitCell}
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSeparator />

            {/* Tablo seçimi */}
            <ContextMenuItem onSelect={selectWholeTable}>
              {uiText(t, "Select entire table")}
            </ContextMenuItem>

            <ContextMenuSeparator />

            {/* Başlık işlemleri */}
            <ContextMenuItem onSelect={() => run(toggleHeaderRow)}>
              {t.tableMenu.toggleHeaderRow}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => run(toggleHeaderColumn)}>
              {t.tableMenu.toggleHeaderColumn}
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem
              onSelect={() => run(deleteTable)}
              className="text-destructive focus:text-destructive"
            >
              {t.tableMenu.deleteTable}
            </ContextMenuItem>
          </>
      </ContextMenuContent>}
    </ContextMenu>
  );
}
