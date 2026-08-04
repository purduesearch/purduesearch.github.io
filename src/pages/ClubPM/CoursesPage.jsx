import React from 'react';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';
import CoursesTab from '../../components/clubpm/courses/CoursesTab';

/**
 * Courses used to be the eighth tab of the Outreach Hub. It now owns a
 * top-level nav slot and route (/clubpm/courses); this wrapper supplies the
 * page chrome that the hub's tab bar used to provide. CoursesTab itself is
 * unchanged and still receives the same two props.
 */
export default function CoursesPage() {
  const { member } = useClubPmAuth();

  return (
    <div className="clubpm-app pm-courses-page">
      <div className="pm-outreach-page-header">
        <div>
          <h1 className="pm-outreach-page-title">
            <i className="fas fa-graduation-cap" aria-hidden="true" style={{ marginRight: 10, color: 'var(--pm-accent-teal)' }} />
            Courses
          </h1>
          <p className="pm-outreach-page-sub">Training walkthroughs, slides, and quizzes for the club.</p>
        </div>
      </div>

      <CoursesTab isAdmin={!!member?.isAdmin} currentMemberId={member?.id} />
    </div>
  );
}
