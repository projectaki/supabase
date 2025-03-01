import * as Tooltip from '@radix-ui/react-tooltip'
import clsx from 'clsx'
import { IS_PLATFORM } from 'common'
import saveAs from 'file-saver'
import { Eye, MoreHorizontal, Table2, Unlock } from 'lucide-react'
import Link from 'next/link'
import Papa from 'papaparse'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconCopy,
  IconDownload,
  IconEdit,
  IconLock,
  IconTrash,
  cn,
} from 'ui'

import { parseSupaTable } from 'components/grid'
import type { ItemRenderer } from 'components/ui/InfiniteList'
import { ENTITY_TYPE } from 'data/entity-types/entity-type-constants'
import type { Entity } from 'data/entity-types/entity-type-query'
import { fetchAllTableRows } from 'data/table-rows/table-rows-query'
import { getTable } from 'data/tables/table-query'
import { useStore } from 'hooks'
import { useTableEditorStateSnapshot } from 'state/table-editor'
import { useProjectContext } from '../ProjectLayout/ProjectContext'

export interface EntityListItemProps {
  id: number
  projectRef: string
  isLocked: boolean
}

const EntityListItem: ItemRenderer<Entity, EntityListItemProps> = ({
  id,
  projectRef,
  item: entity,
  isLocked,
}) => {
  const { ui } = useStore()
  const { project } = useProjectContext()
  const snap = useTableEditorStateSnapshot()

  const isActive = Number(id) === entity.id

  const formatTooltipText = (entityType: string) => {
    return Object.entries(ENTITY_TYPE)
      .find(([, value]) => value === entityType)?.[0]
      ?.toLowerCase()
      ?.split('_')
      ?.join(' ')
  }

  const exportTableAsCSV = async () => {
    if (IS_PLATFORM && !project?.connectionString)
      return console.error('Connection string is required')
    const toastId = ui.setNotification({
      category: 'loading',
      message: `Exporting ${entity.name} as CSV...`,
    })

    try {
      const table = await getTable({
        id: entity.id,
        projectRef,
        connectionString: project?.connectionString,
      })
      const supaTable =
        table &&
        parseSupaTable(
          {
            table: table,
            columns: table.columns ?? [],
            primaryKeys: table.primary_keys,
            relationships: table.relationships,
          },
          []
        )

      const rows = await fetchAllTableRows({
        projectRef,
        connectionString: project?.connectionString,
        table: supaTable,
      })
      const formattedRows = rows.map((row) => {
        const formattedRow = row
        Object.keys(row).map((column) => {
          if (typeof row[column] === 'object' && row[column] !== null)
            formattedRow[column] = JSON.stringify(formattedRow[column])
        })
        return formattedRow
      })

      if (formattedRows.length > 0) {
        const csv = Papa.unparse(formattedRows, {
          columns: supaTable.columns.map((column) => column.name),
        })
        const csvData = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        saveAs(csvData, `${entity!.name}_rows.csv`)
      }

      ui.setNotification({
        id: toastId,
        category: 'success',
        message: `Successfully exported ${entity.name} as CSV`,
      })
    } catch (error: any) {
      ui.setNotification({
        id: toastId,
        category: 'error',
        message: `Failed to export table: ${error.message}`,
      })
    }
  }

  return (
    <Link
      title={entity.name}
      href={`/project/${projectRef}/editor/${entity.id}`}
      role="button"
      aria-label={`View ${entity.name}`}
      className={cn(
        'w-full',
        'flex items-center gap-2',
        'py-1 px-2',
        'text-light',
        'rounded-md',
        isActive ? 'bg-selection' : 'hover:bg-surface-200 focus:bg-surface-200',
        'group',
        'transition'
      )}
    >
      <Tooltip.Root delayDuration={0} disableHoverableContent={true}>
        <Tooltip.Trigger className="min-w-4" asChild>
          {entity.type === ENTITY_TYPE.TABLE ? (
            <Table2 size={15} strokeWidth={1.5} className="text-foreground-lighter" />
          ) : entity.type === ENTITY_TYPE.VIEW ? (
            <Eye size={15} strokeWidth={1.5} className="text-foreground-lighter" />
          ) : (
            <div
              className={clsx(
                'flex items-center justify-center text-xs h-4 w-4 rounded-[2px] font-bold',
                entity.type === ENTITY_TYPE.FOREIGN_TABLE && 'text-yellow-900 bg-yellow-500',
                entity.type === ENTITY_TYPE.MATERIALIZED_VIEW && 'text-purple-1000 bg-purple-500',
                entity.type === ENTITY_TYPE.PARTITIONED_TABLE &&
                  'text-foreground-light bg-border-stronger'
              )}
            >
              {Object.entries(ENTITY_TYPE)
                .find(([, value]) => value === entity.type)?.[0]?.[0]
                ?.toUpperCase()}
            </div>
          )}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="bottom"
            className={[
              'rounded bg-alternative py-1 px-2 leading-none shadow',
              'border border-background',
              'text-xs text-foreground capitalize',
            ].join(' ')}
          >
            <Tooltip.Arrow className="radix-tooltip-arrow" />
            {formatTooltipText(entity.type)}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
      <div
        className={cn(
          'truncate',
          'overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-2 relative w-full',
          isActive && 'text-foreground'
        )}
      >
        <span
          className={cn(
            isActive ? 'text-foreground' : 'text-foreground-light group-hover:text-foreground',
            'text-sm',
            'transition',
            'truncate'
          )}
        >
          {entity.name}
        </span>
        {entity.type === ENTITY_TYPE.TABLE && !entity.rls_enabled && (
          <Unlock
            size={14}
            strokeWidth={2}
            className={cn('min-w-4', isActive ? 'text-warning-600' : 'text-warning-500')}
          />
        )}
      </div>

      {entity.type === ENTITY_TYPE.TABLE && isActive && !isLocked && (
        <DropdownMenu>
          <DropdownMenuTrigger className="text-foreground-lighter transition-all hover:text-foreground data-[state=open]:text-foreground">
            <MoreHorizontal size={14} strokeWidth={2} />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="start">
            <DropdownMenuItem
              key="edit-table"
              className="space-x-2"
              onClick={(e) => {
                e.stopPropagation()
                snap.onEditTable()
              }}
            >
              <IconEdit size="tiny" />
              <span>Edit Table</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              key="duplicate-table"
              className="space-x-2"
              onClick={(e) => {
                e.stopPropagation()
                snap.onDuplicateTable()
              }}
            >
              <IconCopy size="tiny" />
              <span>Duplicate Table</span>
            </DropdownMenuItem>
            <DropdownMenuItem key="view-policies" className="space-x-2" asChild>
              <Link
                key="view-policies"
                href={`/project/${projectRef}/auth/policies?schema=${snap.selectedSchemaName}&search=${entity.id}`}
              >
                <IconLock size="tiny" />
                <span>View Policies</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              key="download-table-csv"
              className="space-x-2"
              onClick={(e) => {
                e.stopPropagation()
                exportTableAsCSV()
              }}
            >
              <IconDownload size="tiny" />
              <span>Export as CSV</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              key="delete-table"
              className="space-x-2"
              onClick={(e) => {
                e.stopPropagation()
                snap.onDeleteTable()
              }}
            >
              <IconTrash size="tiny" />
              <span>Delete Table</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </Link>
  )
}

export default EntityListItem
