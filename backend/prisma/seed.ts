import { PrismaClient, ProjectType, TaskStatus, Priority, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("🌱 Seeding database...");

  // Clean existing data
  await prisma.projectUpdate.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.member.deleteMany();

  // Create members
  const alice = await prisma.member.create({
    data: {
      slackId: "U_ALICE_DEMO",
      slackHandle: "alice.eng",
      displayName: "Alice Chen",
      avatarUrl: "https://api.dicebear.com/8.x/avataaars/svg?seed=alice",
      role: Role.LEAD,
    },
  });

  const bob = await prisma.member.create({
    data: {
      slackId: "U_BOB_DEMO",
      slackHandle: "bob.research",
      displayName: "Bob Martinez",
      avatarUrl: "https://api.dicebear.com/8.x/avataaars/svg?seed=bob",
      role: Role.MEMBER,
    },
  });

  console.log(`  ✅ Created members: ${alice.displayName}, ${bob.displayName}`);

  // Create project
  const project = await prisma.project.create({
    data: {
      name: "Autonomous Drone Navigation",
      description:
        "Building a vision-based autonomous navigation system for indoor drone flight using ROS2 and depth cameras.",
      slackChannel: "C_DEMO_CHANNEL",
      type: ProjectType.ENGINEERING,
      startDate: new Date("2026-04-01"),
      targetDate: new Date("2026-06-30"),
      members: {
        create: [
          { memberId: alice.id, projectRole: "Lead Engineer" },
          { memberId: bob.id, projectRole: "Research Analyst" },
        ],
      },
    },
  });

  console.log(`  ✅ Created project: ${project.name}`);

  // Create tasks
  const tasks = await Promise.all([
    prisma.task.create({
      data: {
        title: "Set up ROS2 workspace and dependencies",
        description: "Initialize the ROS2 Humble workspace with all required packages for drone simulation.",
        status: TaskStatus.DONE,
        priority: Priority.HIGH,
        dueDate: new Date("2026-04-10"),
        projectId: project.id,
        assigneeId: alice.id,
      },
    }),
    prisma.task.create({
      data: {
        title: "Literature review: visual SLAM algorithms",
        description: "Survey recent papers on visual SLAM for indoor environments. Focus on ORB-SLAM3 and alternatives.",
        status: TaskStatus.IN_PROGRESS,
        priority: Priority.MEDIUM,
        dueDate: new Date("2026-04-25"),
        projectId: project.id,
        assigneeId: bob.id,
      },
    }),
    prisma.task.create({
      data: {
        title: "Implement depth camera driver node",
        description: "Write a ROS2 node to interface with the Intel RealSense D435i depth camera.",
        status: TaskStatus.TODO,
        priority: Priority.HIGH,
        dueDate: new Date("2026-05-05"),
        projectId: project.id,
        assigneeId: alice.id,
      },
    }),
  ]);

  console.log(`  ✅ Created ${tasks.length} tasks`);

  // Create a project update
  await prisma.projectUpdate.create({
    data: {
      projectId: project.id,
      authorId: alice.id,
      content:
        "Completed initial workspace setup. ROS2 Humble is installed and the Gazebo simulation environment is running. Next step: camera driver integration.",
    },
  });

  console.log("  ✅ Created project update");
  console.log("🎉 Seed complete!");
}

main()
  .catch((e: unknown) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
