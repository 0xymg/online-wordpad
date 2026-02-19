"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
  const [inTable, setInTable] = useState(false);

  // Sağ tıkta tablo içinde olup olmadığını kontrol et
  const handleContextMenu = useCallback(() => {
    const v = viewRef.current;
    if (!v) { setInTable(false); return; }
    setInTable(isInTable(v.state));
  }, [viewRef]);

  const run = (cmd: (state: any, dispatch: any) => boolean) => {
    const v = viewRef.current;
    if (!v) return;
    cmd(v.state, v.dispatch);
    v.focus();
  };

  const selectWholeTable = () => {
    const v = viewRef.current;
    if (!v) return;
    const table = findTable(v.state.selection);
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
              <ContextMenuSubTrigger>Column</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem onSelect={() => run(addColumnBefore)}>
                  Insert column left
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => run(addColumnAfter)}>
                  Insert column right
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onSelect={() => run(deleteColumn)}
                  className="text-destructive focus:text-destructive"
                >
                  Delete column
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>

            {/* Satır işlemleri */}
            <ContextMenuSub>
              <ContextMenuSubTrigger>Row</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem onSelect={() => run(addRowBefore)}>
                  Insert row above
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => run(addRowAfter)}>
                  Insert row below
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onSelect={() => run(deleteRow)}
                  className="text-destructive focus:text-destructive"
                >
                  Delete row
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>

            {/* Hücre işlemleri */}
            <ContextMenuSub>
              <ContextMenuSubTrigger>Cell</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem onSelect={() => run(mergeCells)}>
                  Merge cells
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => run(splitCell)}>
                  Split cell
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSeparator />

            {/* Tablo seçimi */}
            <ContextMenuItem onSelect={selectWholeTable}>
              Select entire table
            </ContextMenuItem>

            <ContextMenuSeparator />

            {/* Başlık işlemleri */}
            <ContextMenuItem onSelect={() => run(toggleHeaderRow)}>
              Toggle header row
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => run(toggleHeaderColumn)}>
              Toggle header column
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem
              onSelect={() => run(deleteTable)}
              className="text-destructive focus:text-destructive"
            >
              Delete table
            </ContextMenuItem>
          </>
        ) : (
          <ContextMenuItem disabled className="text-muted-foreground text-xs">
            Right-click inside a table for table options
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
