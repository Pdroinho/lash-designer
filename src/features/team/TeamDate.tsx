import type { ComponentProps } from 'react'
import { ProductDate } from '../../components/ProductDate'
export function TeamDate(props: ComponentProps<typeof ProductDate>) { return <ProductDate {...props} minDate={props.today} /> }
