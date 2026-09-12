import { render } from 'preact'
import './styles/tokens.css'
import './styles/base.css'
import './styles/detail-patterns.css'
import { App } from './app/App'

render(<App />, document.getElementById('app')!)
