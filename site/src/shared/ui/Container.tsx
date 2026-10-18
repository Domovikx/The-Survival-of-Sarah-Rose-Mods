import * as stylex from '@stylexjs/stylex'
import type { PropsWithChildren } from 'react'

const styles = stylex.create({
  wrap: {
    maxWidth: 920,
    margin: '0 auto',
    paddingLeft: 20,
    paddingRight: 20,
  },
})

export const Container = ({ children }: PropsWithChildren) => (
  <div className={stylex.props(styles.wrap).className}>{children}</div>
)
