import { useState, useEffect, useRef } from 'react'
import './App.css'

function Home() {
  return (
    <div className="page-content">
      <p className="exploring-text"> 𓆸 coming soon...</p>
    </div>
  )
}

function About() {
  const timelineItems = [
    {
      title: 'Bachelor of Science',
      description: 'Majored in Anatomy and Developmental Biology, building a strong foundation in biological systems and research methodology.'
    },
    {
      title: 'Bachelor of Science (Honours)',
      description: 'Graduated First Class with a dissertation focused on genetic sex determination in mice, developing advanced research and analytical skills.'
    },
    {
      title: 'PhD (Neurogenetics)',
      description: 'Commenced doctoral research investigating neurodegeneration in C. elegans, gaining deep experience in experimental design before pivoting to computer science.'
    },
    {
      title: 'Bachelor of Computer Science',
      description: 'Majoring in Advanced Computer Science with minors in Interactive Media, focusing on software engineering, systems design, and human-centered technology.'
    },
    {
      title: 'Software Engineering Intern – NAB',
      description: 'Worked in a backend and DevOps hybrid role, contributing to production systems and learning large-scale enterprise engineering practices.'
    },
    {
      title: 'Associate Engineer – NAB',
      description: 'Supported corporate and institutional banking platforms, building strong foundations in enterprise systems, reliability, and collaboration.'
    },
    {
      title: 'Analyst Engineer – NAB',
      description: 'Full-stack engineer with experience across development, change management, and SRE-aligned responsibilities.'
    },
    {
      title: 'Senior Analyst Engineer – NAB',
      description: 'Leading the development, support, and testing of Express Business Deposit technology while supporting multiple retail banking assets.'
    }
  ]

  const [visibleItems, setVisibleItems] = useState([])
  const timelineRef = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Animate the timeline line first
            if (entry.target) {
              entry.target.classList.add('animate-line')
            }
            
            // Then animate items one by one with delay
            timelineItems.forEach((_, index) => {
              setTimeout(() => {
                setVisibleItems((prev) => {
                  if (!prev.includes(index)) {
                    return [...prev, index]
                  }
                  return prev
                })
              }, 400 + index * 200)
            })
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1 }
    )

    const currentRef = timelineRef.current
    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef)
      }
    }
  }, [timelineItems.length])

  return (
    <div className="page-content">
      <div className="about-container">
        <div className="about-intro">
          <div className="profile-image-container">
            <div className="profile-circle"></div>
          </div>
          <p>I’m Michelle, a Melbourne-based software developer with 5 years of experience. This is where I experiment, grow, and build meaningful digital products ~ with a focus on empowering women to become the best version of themselves.</p>
        </div>
        <div className="timeline" ref={timelineRef}>
          {timelineItems.map((item, index) => (
            <div 
              key={index} 
              className={`timeline-item ${visibleItems.includes(index) ? 'visible' : ''}`}
            >
              <div className="timeline-marker"></div>
              <div className="timeline-content">
                <div className="timeline-header">
                  <div className="timeline-title">{item.title}</div>
                </div>
                <div className="timeline-description">{item.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState('home')

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1 className="studio-name">Petal Studios </h1>
          <nav className="tabs">
            <button 
              className={`tab ${activeTab === 'home' ? 'active' : ''}`}
              onClick={() => setActiveTab('home')}
            >
              Home
            </button>
            <button 
              className={`tab ${activeTab === 'about' ? 'active' : ''}`}
              onClick={() => setActiveTab('about')}
            >
              About
            </button>
          </nav>
        </div>
      </header>

      <main className="main-content">
        {activeTab === 'home' && <Home />}
        {activeTab === 'about' && <About />}
      </main>
    </div>
  )
}

export default App
