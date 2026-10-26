function App() {
  return (
    <main className="scene-shell">
      <section className="scene-host" data-testid="scene-host" aria-label="Island scene" />
      <p className="scene-loading" role="status">
        The island scene is loading. If it does not appear, refresh the page.
      </p>
      <p className="scene-error" role="alert" aria-label="Scene error" />
    </main>
  )
}

export default App
