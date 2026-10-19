package com.studyroom.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.studyroom.entity.Invitation;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface InvitationMapper extends BaseMapper<Invitation> {
  @Select("SELECT * FROM sr_invitation WHERE code_digest = #{digest} LIMIT 1 FOR UPDATE")
  Invitation selectByDigestForUpdate(@Param("digest") String digest);

  @Select("SELECT * FROM sr_invitation WHERE id = #{id} LIMIT 1 FOR UPDATE")
  Invitation selectByIdForUpdate(@Param("id") Long id);
}
