import { ProductSelect } from './ProductSelect'
import { TenantBrand, type BrandPresentation } from './TenantBrand'
export function BrandPresentationControls({brand, onLayout, onSize, disabled = false}: {brand: BrandPresentation; onLayout: (value: 'SYMBOL_NAME' | 'FULL')=>void; onSize: (value:'S'|'M'|'L')=>void; disabled?: boolean}) {
  return <div className="brand-presentation-controls">
    <label className="team-field">Como mostrar sua marca<ProductSelect ariaLabel="Apresentação da logo" value={brand.logoLayout || 'SYMBOL_NAME'} options={[{value:'SYMBOL_NAME',label:'Símbolo + nome',description:'Nome do espaço ao lado da imagem.'},{value:'FULL',label:'Logo completa',description:'A imagem já inclui o nome do espaço.'}]} onChange={value=>onLayout(value as 'SYMBOL_NAME'|'FULL')} disabled={disabled || !brand.logoUrl} /></label>
    <label className="team-field">Tamanho da marca<ProductSelect ariaLabel="Tamanho da logo" value={brand.logoSize || 'M'} options={[{value:'S',label:'Discreto'},{value:'M',label:'Equilibrado'},{value:'L',label:'Em destaque'}]} onChange={value=>onSize(value as 'S'|'M'|'L')} disabled={disabled || !brand.logoUrl}/></label>
    <div className="brand-preview"><TenantBrand brand={brand} /><small>Prévia da marca · o tamanho se adapta a cada tela</small></div>
  </div>
}
