// @flow
import * as ConfigGen from '../actions/config-gen'
import {compose, connect, setDisplayName} from '../util/container'
import OutOfDate from './out-of-date'

const mapStateToProps = state => ({
  _outOfDate: state.config.outOfDate,
})

const mapDispatchToProps = dispatch => ({
  updateNow: () => dispatch(ConfigGen.createUpdateNow()),
})

const mergeProps = ({_outOfDate}, {updateNow}) => {
  return {
    outOfDate: !!_outOfDate,
    critical: _outOfDate === 'critically-out-of-date',
    updateNow,
  }
}

export default compose(
  connect(mapStateToProps, mapDispatchToProps, mergeProps),
  setDisplayName('ConnectedOutOfDate')
)(OutOfDate)
