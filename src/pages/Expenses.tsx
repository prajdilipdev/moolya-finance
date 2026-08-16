import React from 'react'
import { useApp } from '@/context/AppContext'
import { usePeriod } from '@/context/PeriodContext'
import { FilterableFlow } from '@/components/FlowView'

export function Expenses() {
  const { db } = useApp()
  const { range } = usePeriod()
  return <FilterableFlow db={db} range={range} type="expense" title="Expenses" icon="Receipt" tone="negative" />
}
