"use client";

import { useT } from "./I18nProvider";
import { uiText } from "@/lib/i18n/ui";
import { useState, useCallback } from "react";
import type { Command } from "prosemirror-state";
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
}

export default function TableContextMenu({ viewRef, children }: TableContextMenuProps) {
  const t = useT();
  const [inTable, setInTable] = useState(false);

  // Sağ tıkta tablo içinde olup olmadığını kontrol et
  const handleContextMenu = useCallback(() => {
    const v = viewRef.current;
    if (!v) { setInTable(false); return; }
    setInTable(isInTable(v.state));
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
      <ContextMenuTrigger asChild onContextMenu={handleContextMenu}>
        <div className="contents">{children}</div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">
        {inTable ? (
          <>
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
        ) : (
          <ContextMenuItem disabled className="text-muted-foreground text-xs">
            {t.tableMenu.hint}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
