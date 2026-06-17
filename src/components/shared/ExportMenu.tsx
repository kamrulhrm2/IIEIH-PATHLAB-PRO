import { useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsx } from '@/lib/xlsx';

type Cell = string | number | null | undefined;

interface ExportMenuProps {
  /** File name WITHOUT extension — the menu appends .csv / .xlsx. */
  filename: string;
  sheetName: string;
  headers: string[];
  rows: Cell[][];
  disabled?: boolean;
}

/** A single "Export ▾" button offering CSV or Excel download of the same data. */
export function ExportMenu({ filename, sheetName, headers, rows, disabled }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const itemClass =
    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Download className="h-4 w-4" /> Export
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        <button
          type="button"
          className={itemClass}
          onClick={() => {
            downloadCsv(`${filename}.csv`, headers, rows);
            setOpen(false);
          }}
        >
          <FileText className="h-4 w-4 text-slate-500" /> Download CSV
        </button>
        <button
          type="button"
          className={itemClass}
          onClick={() => {
            downloadXlsx(`${filename}.xlsx`, sheetName, headers, rows).catch(() =>
              toast.error('Could not generate the Excel file')
            );
            setOpen(false);
          }}
        >
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Download Excel
        </button>
      </PopoverContent>
    </Popover>
  );
}
