import { S } from './strings'
import type { Session } from './session'

const SPEEDS = [0.5, 1, 2, 4]

// Play / pause, reset and the speed choice, as plain DOM in the top bar.
export function buildControls(bar: HTMLElement, session: Session, onReset: () => void): void {
  const title = document.createElement('span')
  title.className = 'title'
  title.textContent = S.title

  const play = document.createElement('button')
  const refreshPlay = () => (play.textContent = session.playing ? S.pause : S.play)
  play.addEventListener('click', () => {
    session.playing = !session.playing
    refreshPlay()
  })
  refreshPlay()

  const reset = document.createElement('button')
  reset.textContent = S.reset
  reset.addEventListener('click', onReset)

  const speedLabel = document.createElement('label')
  const speed = document.createElement('select')
  for (const value of SPEEDS) speed.add(new Option(`${value}x`, String(value), false, value === session.speed))
  speed.addEventListener('change', () => (session.speed = Number(speed.value)))
  speedLabel.append(S.speed, speed)

  bar.append(title, play, reset, speedLabel)
}
