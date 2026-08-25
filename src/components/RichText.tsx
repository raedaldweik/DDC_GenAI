import { Fragment } from 'react'

// Renders **bold** spans in the dashboard's gold accent, everything else plain.
const RichText = ({ text }: { text: string }) => (
  <>
    {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong
          key={i}
          className='font-bold text-[#f2c76e]'>
          {part.slice(2, -2)}
        </strong>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      )
    )}
  </>
)

export default RichText
