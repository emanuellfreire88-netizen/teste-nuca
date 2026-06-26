import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';

async function main() {
  console.log('🌱 Iniciando seed completo do banco de dados...');

  // ==========================================
  // 1. LIMPAR DADOS EXISTENTES (ordem por dependência)
  // ==========================================
  console.log('🧹 Limpando dados existentes...');
  await db.participationBadge.deleteMany();
  await db.eventParticipant.deleteMany();
  await db.attendanceRecord.deleteMany();
  await db.supportMessage.deleteMany();
  await db.supportTicket.deleteMany();
  await db.actionLog.deleteMany();
  await db.session.deleteMany();
  await db.event.deleteMany();
  await db.student.deleteMany();
  await db.school.deleteMany();
  await db.user.deleteMany();

  // ==========================================
  // 2. CRIAR USUÁRIOS
  // ==========================================
  console.log('👤 Criando usuários...');
  const hashedPassword = await bcrypt.hash('Admin@123', 12);

  const admin = await db.user.create({
    data: {
      full_name: 'Administrador',
      email: 'admin@nuca.com',
      password: hashedPassword,
      role: 'Admin',
      status: 'active',
      must_change_password: false,
    },
  });

  const emanuell = await db.user.create({
    data: {
      full_name: 'Emanuell Freire',
      email: 'emanuell.fp.rocha@gmail.com',
      password: hashedPassword,
      role: 'Admin',
      status: 'active',
      must_change_password: false,
    },
  });

  const operator1 = await db.user.create({
    data: {
      full_name: 'Maria Silva',
      email: 'maria.silva@nuca.com',
      password: hashedPassword,
      role: 'Operator',
      status: 'active',
      must_change_password: true,
    },
  });

  const operator2 = await db.user.create({
    data: {
      full_name: 'João Santos',
      email: 'joao.santos@nuca.com',
      password: hashedPassword,
      role: 'Operator',
      status: 'active',
      must_change_password: true,
    },
  });

  const viewer1 = await db.user.create({
    data: {
      full_name: 'Ana Oliveira',
      email: 'ana.oliveira@nuca.com',
      password: hashedPassword,
      role: 'Viewer',
      status: 'active',
      must_change_password: true,
    },
  });

  console.log(`✅ ${5} usuários criados`);

  // ==========================================
  // 3. CRIAR ESCOLAS
  // ==========================================
  console.log('🏫 Criando escolas...');
  const schools = await Promise.all([
    db.school.create({
      data: {
        name: 'EMEF Professora Maria Aparecida',
        address: 'Rua das Flores, 123 - Centro, São Paulo - SP',
        phone: '(11) 3456-7890',
        email: 'contato@emaparecida.sp.gov.br',
        director_name: 'Prof. Carlos Eduardo Lima',
        opening_hours: '07:00 - 17:00',
        latitude: -23.5505,
        longitude: -46.6333,
      },
    }),
    db.school.create({
      data: {
        name: 'EMEI Monteiro Lobato',
        address: 'Av. Paulista, 456 - Bela Vista, São Paulo - SP',
        phone: '(11) 2345-6789',
        email: 'secretaria@emmonteirolabato.sp.gov.br',
        director_name: 'Profa. Lucia Fernandes',
        opening_hours: '07:30 - 16:30',
        latitude: -23.5631,
        longitude: -46.6544,
      },
    }),
    db.school.create({
      data: {
        name: 'CEU Butantã',
        address: 'Rua Eng. Heitor Antônio Eiras Garcia, 789 - Butantã, São Paulo - SP',
        phone: '(11) 3765-4321',
        email: 'ceu.butanta@sp.gov.br',
        director_name: 'Prof. Roberto Mendes',
        opening_hours: '06:30 - 18:00',
        latitude: -23.5678,
        longitude: -46.7341,
      },
    }),
    db.school.create({
      data: {
        name: 'EMEF Villa-Lobos',
        address: 'Rua Fradique Coutinho, 321 - Pinheiros, São Paulo - SP',
        phone: '(11) 3032-9876',
        email: 'contato@emvillalobos.sp.gov.br',
        director_name: 'Profa. Beatriz Souza',
        opening_hours: '07:00 - 17:30',
        latitude: -23.5589,
        longitude: -46.6788,
      },
    }),
    db.school.create({
      data: {
        name: 'CIEP Brizola',
        address: 'Rua do Manifesto, 567 - Vila Mariana, São Paulo - SP',
        phone: '(11) 5087-1234',
        email: 'ciep.brizola@sp.gov.br',
        director_name: 'Prof. Fernando Almeida',
        opening_hours: '07:00 - 16:00',
        latitude: -23.5874,
        longitude: -46.6376,
      },
    }),
  ]);
  console.log(`✅ ${schools.length} escolas criadas`);

  // ==========================================
  // 4. CRIAR ALUNOS
  // ==========================================
  console.log('🎓 Criando alunos...');
  const studentData = [
    // Escola 1 - Professora Maria Aparecida
    { name: 'Pedro Henrique Almeida', cpf: '123.456.789-01', rg: '12.345.678-9', dob: '2014-03-15', blood: 'O+', class: '5º Ano A', grade: '5º Ano', phone: '(11) 98765-4321', address: 'Rua das Palmeiras, 45', guardian: 'Luciana Almeida', guardianPhone: '(11) 98765-4321', guardianEmail: 'luciana.almeida@email.com', emergency: '(11) 91234-5678', schoolId: schools[0].id },
    { name: 'Sofia Martins Costa', cpf: '234.567.890-12', rg: '23.456.789-0', dob: '2015-07-22', blood: 'A+', class: '4º Ano B', grade: '4º Ano', phone: '(11) 97654-3210', address: 'Av. Brasil, 89', guardian: 'Ricardo Costa', guardianPhone: '(11) 97654-3210', guardianEmail: 'ricardo.costa@email.com', emergency: '(11) 92345-6789', schoolId: schools[0].id },
    { name: 'Lucas Gabriel Ferreira', cpf: '345.678.901-23', rg: '34.567.890-1', dob: '2013-11-08', blood: 'B-', class: '6º Ano A', grade: '6º Ano', phone: '(11) 96543-2109', address: 'Rua dos Ipês, 112', guardian: 'Fernanda Ferreira', guardianPhone: '(11) 96543-2109', guardianEmail: 'fernanda.f@email.com', emergency: '(11) 93456-7890', schoolId: schools[0].id },
    { name: 'Isabela Rodrigues', cpf: '456.789.012-34', rg: '45.678.901-2', dob: '2014-05-30', blood: 'AB+', class: '5º Ano B', grade: '5º Ano', phone: '(11) 95432-1098', address: 'Rua das Orquídeas, 67', guardian: 'Marcos Rodrigues', guardianPhone: '(11) 95432-1098', guardianEmail: 'marcos.r@email.com', emergency: '(11) 94567-8901', schoolId: schools[0].id },
    { name: 'Enzo Miguel Santos', cpf: '567.890.123-45', rg: '56.789.012-3', dob: '2015-01-19', blood: 'O-', class: '4º Ano A', grade: '4º Ano', phone: '(11) 94321-0987', address: 'Rua São Jorge, 201', guardian: 'Patricia Santos', guardianPhone: '(11) 94321-0987', guardianEmail: 'patricia.s@email.com', emergency: '(11) 95678-9012', schoolId: schools[0].id },

    // Escola 2 - Monteiro Lobato
    { name: 'Valentina Oliveira Lima', cpf: '678.901.234-56', rg: '67.890.123-4', dob: '2016-09-12', blood: 'A-', class: '3º Ano A', grade: '3º Ano', phone: '(11) 93210-9876', address: 'Rua das Acácias, 33', guardian: 'Juliana Lima', guardianPhone: '(11) 93210-9876', guardianEmail: 'juliana.lima@email.com', emergency: '(11) 96789-0123', schoolId: schools[1].id },
    { name: 'Davi Luiz Pereira', cpf: '789.012.345-67', rg: '78.901.234-5', dob: '2015-04-25', blood: 'B+', class: '4º Ano A', grade: '4º Ano', phone: '(11) 92109-8765', address: 'Rua dos Pássaros, 78', guardian: 'Alexandre Pereira', guardianPhone: '(11) 92109-8765', guardianEmail: 'alexandre.p@email.com', emergency: '(11) 97890-1234', schoolId: schools[1].id },
    { name: 'Helena Fernandes Nascimento', cpf: '890.123.456-78', rg: '89.012.345-6', dob: '2016-12-03', blood: 'O+', class: '3º Ano B', grade: '3º Ano', phone: '(11) 91098-7654', address: 'Rua das Margaridas, 156', guardian: 'Carla Nascimento', guardianPhone: '(11) 91098-7654', guardianEmail: 'carla.n@email.com', emergency: '(11) 98901-2345', schoolId: schools[1].id },
    { name: 'Arthur Gomes Ribeiro', cpf: '901.234.567-89', rg: '90.123.456-7', dob: '2015-08-17', blood: 'AB-', class: '4º Ano B', grade: '4º Ano', phone: '(11) 90987-6543', address: 'Av. das Nações, 92', guardian: 'Sandra Ribeiro', guardianPhone: '(11) 90987-6543', guardianEmail: 'sandra.r@email.com', emergency: '(11) 99012-3456', schoolId: schools[1].id },

    // Escola 3 - CEU Butantã
    { name: 'Laura Beatriz Souza', cpf: '012.345.678-90', rg: '01.234.567-8', dob: '2014-02-28', blood: 'A+', class: '5º Ano A', grade: '5º Ano', phone: '(11) 89876-5432', address: 'Rua das Bromélias, 189', guardian: 'Thiago Souza', guardianPhone: '(11) 89876-5432', guardianEmail: 'thiago.s@email.com', emergency: '(11) 90123-4567', schoolId: schools[2].id },
    { name: 'Bernardo Costa Almeida', cpf: '112.233.445-56', rg: '11.223.344-5', dob: '2013-06-14', blood: 'O+', class: '6º Ano B', grade: '6º Ano', phone: '(11) 88765-4321', address: 'Rua Guapuruvu, 44', guardian: 'Mariana Almeida', guardianPhone: '(11) 88765-4321', guardianEmail: 'mariana.a@email.com', emergency: '(11) 91234-5678', schoolId: schools[2].id },
    { name: 'Alice Martins Dias', cpf: '223.344.556-67', rg: '22.334.455-6', dob: '2014-10-07', blood: 'B+', class: '5º Ano B', grade: '5º Ano', phone: '(11) 87654-3210', address: 'Rua das Cerejeiras, 77', guardian: 'Rodrigo Dias', guardianPhone: '(11) 87654-3210', guardianEmail: 'rodrigo.d@email.com', emergency: '(11) 92345-6789', schoolId: schools[2].id },
    { name: 'Rafael Oliveira Santos', cpf: '334.455.667-78', rg: '33.445.566-7', dob: '2012-12-25', blood: 'AB+', class: '7º Ano A', grade: '7º Ano', phone: '(11) 86543-2109', address: 'Rua Ipê Roxo, 233', guardian: 'Elaine Santos', guardianPhone: '(11) 86543-2109', guardianEmail: 'elaine.s@email.com', emergency: '(11) 93456-7890', schoolId: schools[2].id },
    { name: 'Mariana Ferreira Lima', cpf: '445.556.677-89', rg: '44.556.677-8', dob: '2014-07-19', blood: 'O-', class: '5º Ano A', grade: '5º Ano', phone: '(11) 85432-1098', address: 'Rua Pau-Brasil, 56', guardian: 'Carlos Lima', guardianPhone: '(11) 85432-1098', guardianEmail: 'carlos.l@email.com', emergency: '(11) 94567-8901', schoolId: schools[2].id },

    // Escola 4 - Villa-Lobos
    { name: 'Gabriel Henrique Rocha', cpf: '556.667.778-90', rg: '55.667.778-9', dob: '2013-04-11', blood: 'A-', class: '6º Ano A', grade: '6º Ano', phone: '(11) 84321-0987', address: 'Rua dos Jacarandás, 145', guardian: 'Vanessa Rocha', guardianPhone: '(11) 84321-0987', guardianEmail: 'vanessa.r@email.com', emergency: '(11) 95678-9012', schoolId: schools[3].id },
    { name: 'Camila Rodrigues Silva', cpf: '667.778.889-01', rg: '66.778.889-0', dob: '2015-09-30', blood: 'B-', class: '4º Ano A', grade: '4º Ano', phone: '(11) 83210-9876', address: 'Rua Jequitibá, 89', guardian: 'Paulo Silva', guardianPhone: '(11) 83210-9876', guardianEmail: 'paulo.s@email.com', emergency: '(11) 96789-0123', schoolId: schools[3].id },
    { name: 'Leonardo Nascimento Pereira', cpf: '778.889.990-12', rg: '77.889.990-1', dob: '2012-01-05', blood: 'O+', class: '7º Ano B', grade: '7º Ano', phone: '(11) 82109-8765', address: 'Rua das Perobas, 201', guardian: 'Adriana Pereira', guardianPhone: '(11) 82109-8765', guardianEmail: 'adriana.p@email.com', emergency: '(11) 97890-1234', schoolId: schools[3].id },

    // Escola 5 - CIEP Brizola
    { name: 'Emanuelly Costa Fernandes', cpf: '889.990.001-23', rg: '88.990.001-2', dob: '2016-03-22', blood: 'AB-', class: '3º Ano A', grade: '3º Ano', phone: '(11) 81098-7654', address: 'Rua das Seringueiras, 67', guardian: 'Lucas Fernandes', guardianPhone: '(11) 81098-7654', guardianEmail: 'lucas.f@email.com', emergency: '(11) 98901-2345', schoolId: schools[4].id },
    { name: 'Thiago Gomes Ribeiro', cpf: '990.001.112-34', rg: '99.001.112-3', dob: '2014-11-14', blood: 'A+', class: '5º Ano C', grade: '5º Ano', phone: '(11) 80987-6543', address: 'Rua Jatobá, 134', guardian: 'Beatriz Ribeiro', guardianPhone: '(11) 80987-6543', guardianEmail: 'beatriz.r@email.com', emergency: '(11) 99012-3456', schoolId: schools[4].id },
    { name: 'Júlia Almeida Santos', cpf: '001.112.223-45', rg: '00.112.223-4', dob: '2015-06-08', blood: 'O-', class: '4º Ano C', grade: '4º Ano', phone: '(11) 79876-5432', address: 'Rua Embaúba, 98', guardian: 'Sergio Santos', guardianPhone: '(11) 79876-5432', guardianEmail: 'sergio.s@email.com', emergency: '(11) 90123-4567', schoolId: schools[4].id },
    { name: 'Matheus Souza Lima', cpf: '112.223.334-56', rg: '11.223.334-5', dob: '2013-08-27', blood: 'B+', class: '6º Ano C', grade: '6º Ano', phone: '(11) 78765-4321', address: 'Rua Flamboyant, 223', guardian: 'Denise Lima', guardianPhone: '(11) 78765-4321', guardianEmail: 'denise.l@email.com', emergency: '(11) 91234-5678', schoolId: schools[4].id },
    { name: 'Giovanna Dias Oliveira', cpf: '223.334.445-67', rg: '22.334.445-6', dob: '2016-05-16', blood: 'A+', class: '3º Ano B', grade: '3º Ano', phone: '(11) 77654-3210', address: 'Rua Copaíba, 56', guardian: 'Mauricio Oliveira', guardianPhone: '(11) 77654-3210', guardianEmail: 'mauricio.o@email.com', emergency: '(11) 92345-6789', schoolId: schools[4].id },
  ];

  const students = [];
  for (const s of studentData) {
    const student = await db.student.create({
      data: {
        full_name: s.name,
        cpf: s.cpf,
        rg: s.rg,
        date_of_birth: new Date(s.dob),
        blood_type: s.blood,
        class: s.class,
        grade: s.grade,
        phone: s.phone,
        address: s.address,
        guardian_name: s.guardian,
        guardian_phone: s.guardianPhone,
        guardian_email: s.guardianEmail,
        emergency_contact: s.emergency,
        school_id: s.schoolId,
        status: 'active',
      },
    });
    students.push(student);
  }
  console.log(`✅ ${students.length} alunos criados`);

  // ==========================================
  // 5. CRIAR EVENTOS
  // ==========================================
  console.log('📅 Criando eventos...');
  const now = new Date();
  const events = await Promise.all([
    db.event.create({
      data: {
        title: 'Olimpíadas Escolares 2026',
        description: 'Competição esportiva entre turmas com provas de atletismo, natação e vôlei.',
        date: new Date(now.getFullYear(), now.getMonth() + 1, 15, 8, 0),
        location: 'Quadra Poliesportiva - EMEF Professora Maria Aparecida',
        status: 'upcoming',
        created_by: admin.id,
        school_id: schools[0].id,
        category: 'sports',
      },
    }),
    db.event.create({
      data: {
        title: 'Feira Cultural - Mostra de Artes',
        description: 'Exposição de trabalhos artísticos dos alunos, incluindo pintura, escultura e teatro.',
        date: new Date(now.getFullYear(), now.getMonth() + 1, 22, 9, 0),
        location: 'Salão de Eventos - CEU Butantã',
        status: 'upcoming',
        created_by: emanuell.id,
        school_id: schools[2].id,
        category: 'cultural',
      },
    }),
    db.event.create({
      data: {
        title: 'Festa Junina da Escola',
        description: 'Arraiá com barracas de comida típica, quadrilha e brincadeiras juninas.',
        date: new Date(now.getFullYear(), now.getMonth(), 20, 18, 0),
        location: 'Pátio - EMEI Monteiro Lobato',
        status: 'completed',
        created_by: operator1.id,
        school_id: schools[1].id,
        category: 'party',
      },
    }),
    db.event.create({
      data: {
        title: 'Olimpíada de Matemática',
        description: 'Competição de resolução de problemas matemáticos para alunos do 5º ao 7º ano.',
        date: new Date(now.getFullYear(), now.getMonth() + 2, 10, 8, 0),
        location: 'Auditório - EMEF Villa-Lobos',
        status: 'upcoming',
        created_by: admin.id,
        school_id: schools[3].id,
        category: 'academic',
      },
    }),
    db.event.create({
      data: {
        title: 'Dia do Desafio Esportivo',
        description: 'Dia inteiro de atividades esportivas e recreativas para todas as idades.',
        date: new Date(now.getFullYear(), now.getMonth() - 1, 25, 7, 0),
        location: 'Campo - CIEP Brizola',
        status: 'completed',
        created_by: operator2.id,
        school_id: schools[4].id,
        category: 'sports',
      },
    }),
    db.event.create({
      data: {
        title: 'Apresentação Teatral - O Auto da Compadecida',
        description: 'Peça teatral adaptada encenada pelos alunos do 6º e 7º ano.',
        date: new Date(now.getFullYear(), now.getMonth() + 1, 5, 19, 0),
        location: 'Teatro - EMEF Professora Maria Aparecida',
        status: 'upcoming',
        created_by: emanuell.id,
        school_id: schools[0].id,
        category: 'cultural',
      },
    }),
    db.event.create({
      data: {
        title: 'Gincana Escolar',
        description: 'Competição entre equipes com provas de conhecimento, esporte e criatividade.',
        date: new Date(now.getFullYear(), now.getMonth(), 10, 8, 0),
        location: 'CEU Butantã',
        status: 'completed',
        created_by: admin.id,
        school_id: schools[2].id,
        category: 'other',
      },
    }),
    db.event.create({
      data: {
        title: 'Amistoso de Futsal',
        description: 'Jogo amistoso entre seleções das escolas do município.',
        date: new Date(now.getFullYear(), now.getMonth() + 2, 20, 14, 0),
        location: 'Quadra - CIEP Brizola',
        status: 'upcoming',
        created_by: operator1.id,
        school_id: schools[4].id,
        category: 'sports',
      },
    }),
  ]);
  console.log(`✅ ${events.length} eventos criados`);

  // ==========================================
  // 6. CRIAR PARTICIPAÇÕES EM EVENTOS
  // ==========================================
  console.log('👥 Criando participações em eventos...');
  const completedEvents = events.filter(e => e.status === 'completed');
  const upcomingEvents = events.filter(e => e.status === 'upcoming');

  // For completed events, all students from that school participated
  let participationCount = 0;
  for (const event of completedEvents) {
    const schoolStudents = students.filter(s => s.school_id === event.school_id);
    for (const student of schoolStudents) {
      await db.eventParticipant.create({
        data: {
          event_id: event.id,
          student_id: student.id,
          attended: true,
          added_by: admin.id,
        },
      });
      participationCount++;
    }
  }

  // For upcoming events, add some students
  for (const event of upcomingEvents) {
    const schoolStudents = students.filter(s => s.school_id === event.school_id);
    // Add about 60-80% of students
    const numToadd = Math.floor(schoolStudents.length * (0.6 + Math.random() * 0.2));
    const selectedStudents = schoolStudents.slice(0, numToadd);
    for (const student of selectedStudents) {
      await db.eventParticipant.create({
        data: {
          event_id: event.id,
          student_id: student.id,
          attended: false,
          added_by: Math.random() > 0.5 ? admin.id : emanuell.id,
        },
      });
      participationCount++;
    }
  }
  console.log(`✅ ${participationCount} participações criadas`);

  // ==========================================
  // 7. CRIAR REGISTROS DE FREQUÊNCIA
  // ==========================================
  console.log('📋 Criando registros de frequência...');
  let attendanceCount = 0;
  const today = new Date();
  // Create attendance for the last 5 school days
  for (let dayOffset = 1; dayOffset <= 5; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    for (const student of students) {
      // 85% chance of being present
      const isPresent = Math.random() < 0.85;
      await db.attendanceRecord.create({
        data: {
          student_id: student.id,
          date: date,
          status: isPresent ? 'present' : 'absent',
          created_by: Math.random() > 0.5 ? operator1.id : operator2.id,
        },
      });
      attendanceCount++;
    }
  }
  console.log(`✅ ${attendanceCount} registros de frequência criados`);

  // ==========================================
  // 8. CRIAR BADGES
  // ==========================================
  console.log('🏆 Criando badges...');
  // Students who participated in 2+ completed events get badges
  let badgeCount = 0;
  for (const student of students) {
    const participations = await db.eventParticipant.count({
      where: { student_id: student.id, attended: true },
    });
    if (participations >= 2) {
      await db.participationBadge.create({
        data: {
          student_id: student.id,
          badge_type: '2_events',
        },
      });
      badgeCount++;
    }
  }
  console.log(`✅ ${badgeCount} badges criados`);

  // ==========================================
  // 9. CRIAR TICKETS DE SUPORTE
  // ==========================================
  console.log('🎫 Criando tickets de suporte...');
  const ticket1 = await db.supportTicket.create({
    data: {
      protocol: 'SUP-2026-0001',
      subject: 'Não consigo registrar frequência',
      status: 'in_progress',
      priority: 'high',
      user_id: emanuell.id,
      assigned_to: operator1.id,
    },
  });

  await db.supportMessage.createMany({
    data: [
      {
        ticket_id: ticket1.id,
        sender_id: emanuell.id,
        content: 'Olá, estou com dificuldade para registrar a frequência dos alunos. O sistema está retornando erro ao salvar.',
        is_read: true,
        created_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        ticket_id: ticket1.id,
        sender_id: operator1.id,
        content: 'Olá Emanuell! Vou verificar o problema. Pode me dizer qual mensagem de erro aparece?',
        is_read: true,
        created_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        ticket_id: ticket1.id,
        sender_id: emanuell.id,
        content: 'Aparece "Erro ao salvar registro". Tentei com diferentes alunos e o erro persiste.',
        is_read: false,
        created_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      },
    ],
  });

  const ticket2 = await db.supportTicket.create({
    data: {
      protocol: 'SUP-2026-0002',
      subject: 'Dúvida sobre relatório de alunos',
      status: 'open',
      priority: 'normal',
      user_id: viewer1.id,
    },
  });

  await db.supportMessage.create({
    data: {
      ticket_id: ticket2.id,
      sender_id: viewer1.id,
      content: 'Como posso exportar o relatório de alunos agrupados por escola?',
      is_read: false,
    },
  });

  const ticket3 = await db.supportTicket.create({
    data: {
      protocol: 'SUP-2026-0003',
      subject: 'Solicitação de novo usuário',
      status: 'resolved',
      priority: 'normal',
      user_id: operator2.id,
      assigned_to: admin.id,
    },
  });

  await db.supportMessage.createMany({
    data: [
      {
        ticket_id: ticket3.id,
        sender_id: operator2.id,
        content: 'Preciso de um novo acesso de Operador para a escola CEU Butantã.',
        is_read: true,
        created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      },
      {
        ticket_id: ticket3.id,
        sender_id: admin.id,
        content: 'Acesso criado! As credenciais foram enviadas por e-mail. Favor alterar a senha no primeiro login.',
        is_read: true,
        created_at: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
      },
    ],
  });
  console.log(`✅ 3 tickets de suporte criados`);

  // ==========================================
  // 10. CRIAR LOGS DE AÇÃO
  // ==========================================
  console.log('📝 Criando logs de ação...');
  const logEntries = [
    { userId: admin.id, actionType: 'login', description: 'Login realizado: admin@nuca.com', ip: '192.168.1.100' },
    { userId: emanuell.id, actionType: 'login', description: 'Login realizado: emanuell.fp.rocha@gmail.com', ip: '192.168.1.101' },
    { userId: admin.id, actionType: 'create_school', description: 'Escola criada: EMEF Professora Maria Aparecida', ip: '192.168.1.100' },
    { userId: admin.id, actionType: 'create_school', description: 'Escola criada: EMEI Monteiro Lobato', ip: '192.168.1.100' },
    { userId: admin.id, actionType: 'create_school', description: 'Escola criada: CEU Butantã', ip: '192.168.1.100' },
    { userId: emanuell.id, actionType: 'create_school', description: 'Escola criada: EMEF Villa-Lobos', ip: '192.168.1.101' },
    { userId: emanuell.id, actionType: 'create_school', description: 'Escola criada: CIEP Brizola', ip: '192.168.1.101' },
    { userId: operator1.id, actionType: 'create_student', description: 'Aluno criado: Pedro Henrique Almeida', ip: '192.168.1.102' },
    { userId: operator1.id, actionType: 'create_student', description: 'Aluno criado: Sofia Martins Costa', ip: '192.168.1.102' },
    { userId: operator2.id, actionType: 'create_event', description: 'Evento criado: Festa Junina da Escola', ip: '192.168.1.103' },
    { userId: admin.id, actionType: 'create_event', description: 'Evento criado: Olimpíadas Escolares 2026', ip: '192.168.1.100' },
    { userId: operator1.id, actionType: 'export_report', description: 'Relatório exportado: Frequência - EMEF Professora Maria Aparecida', ip: '192.168.1.102' },
    { userId: admin.id, actionType: 'create_user', description: 'Usuário criado: Maria Silva (Operator)', ip: '192.168.1.100' },
    { userId: admin.id, actionType: 'create_user', description: 'Usuário criado: João Santos (Operator)', ip: '192.168.1.100' },
    { userId: emanuell.id, actionType: 'create_support_ticket', description: 'Ticket criado: SUP-2026-0001 - Não consigo registrar frequência', ip: '192.168.1.101' },
    { userId: viewer1.id, actionType: 'create_support_ticket', description: 'Ticket criado: SUP-2026-0002 - Dúvida sobre relatório de alunos', ip: '192.168.1.104' },
    { userId: operator2.id, actionType: 'backup', description: 'Backup manual realizado', ip: '192.168.1.103' },
    { userId: admin.id, actionType: 'update_student', description: 'Aluno atualizado: Gabriel Henrique Rocha', ip: '192.168.1.100' },
    { userId: operator1.id, actionType: 'login', description: 'Login realizado: maria.silva@nuca.com', ip: '192.168.1.102' },
    { userId: operator2.id, actionType: 'login', description: 'Login realizado: joao.santos@nuca.com', ip: '192.168.1.103' },
  ];

  for (let i = 0; i < logEntries.length; i++) {
    const log = logEntries[i];
    const createdAt = new Date(now.getTime() - (logEntries.length - i) * 2 * 60 * 60 * 1000);
    await db.actionLog.create({
      data: {
        user_id: log.userId,
        action_type: log.actionType,
        description: log.description,
        ip_address: log.ip,
        device: 'Chrome/Windows',
        created_at: createdAt,
      },
    });
  }
  console.log(`✅ ${logEntries.length} logs de ação criados`);

  // ==========================================
  // RESUMO
  // ==========================================
  console.log('\n' + '='.repeat(50));
  console.log('🎉 SEED COMPLETO FINALIZADO!');
  console.log('='.repeat(50));
  console.log(`👥 Usuários: ${await db.user.count()}`);
  console.log(`🏫 Escolas: ${await db.school.count()}`);
  console.log(`🎓 Alunos: ${await db.student.count()}`);
  console.log(`📅 Eventos: ${await db.event.count()}`);
  console.log(`👥 Participações: ${await db.eventParticipant.count()}`);
  console.log(`📋 Frequência: ${await db.attendanceRecord.count()}`);
  console.log(`🏆 Badges: ${await db.participationBadge.count()}`);
  console.log(`🎫 Tickets: ${await db.supportTicket.count()}`);
  console.log(`💬 Mensagens: ${await db.supportMessage.count()}`);
  console.log(`📝 Logs: ${await db.actionLog.count()}`);
  console.log('='.repeat(50));
  console.log('📧 Login Admin: admin@nuca.com / Admin@123');
  console.log('📧 Login Emanuell: emanuell.fp.rocha@gmail.com / Admin@123');
  console.log('⚠️  Troque as senhas após o primeiro login!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  });
