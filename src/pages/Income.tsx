import React from 'react'
import { useApp } from '@/context/AppContext'
import { usePeriod } from '@/context/PeriodContext'
import { FilterableFlow } from '@/components/FlowView'

export function Income() {
  const { db } = useApp()
  const { range } = usePeriod()
  return <FilterableFlow db={db} range={range} type="income" title="Income" icon="Wallet" tone="positive" />
}
