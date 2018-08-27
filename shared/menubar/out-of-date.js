// @flow
import * as React from 'react'
import * as Kb from '../common-adapters'
import * as Styles from '../styles'

type Props = {
  outOfDate: boolean,
  critical: boolean,
  updateNow: () => void,
}

const OutOfDate = ({outOfDate, critical, updateNow}: Props) =>
  outOfDate && (
    <Kb.Box2 style={styles.box} fullWidth={true} centerChildren={true} direction="vertical">
      <Kb.Text type="BodySemibold" style={styles.text}>
        Your Keybase app is {critical && 'critically'} out of date.
      </Kb.Text>
      <Kb.Text type="BodySemibold" style={styles.text}>
        Please{' '}
        <Kb.Text type="BodySemibold" underline={true} style={styles.text} onClick={updateNow}>
          update now
        </Kb.Text>.
      </Kb.Text>
    </Kb.Box2>
  )

const styles = Styles.styleSheetCreate({
  box: {
    backgroundColor: Styles.globalColors.red,
    padding: Styles.globalMargins.tiny,
  },
  text: {
    color: Styles.globalColors.white,
  },
})

export default OutOfDate
